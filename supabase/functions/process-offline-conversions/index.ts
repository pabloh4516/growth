import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, getUserOrganization } from '../_shared/auth.ts';

/**
 * GrowthOS — Process Offline Conversions
 *
 * Authenticated endpoint that processes CSV uploads from Supabase Storage.
 * Reads CSV file, creates records in utmify_sales with source='offline',
 * runs campaign matching, and updates the upload record.
 *
 * Endpoint: POST /functions/v1/process-offline-conversions
 * Body: { uploadId: string }
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Authenticate user
    const { user } = await validateAuth(req);
    const { organizationId } = await getUserOrganization(user.id);

    const body = await req.json();
    const { uploadId } = body;

    if (!uploadId) {
      return jsonResponse({ error: 'Missing uploadId' }, 400, corsHeaders);
    }

    // Read the offline_upload record
    const { data: upload, error: uploadError } = await supabase
      .from('offline_uploads')
      .select('*')
      .eq('id', uploadId)
      .eq('organization_id', organizationId)
      .single();

    if (uploadError || !upload) {
      return jsonResponse({ error: 'Upload record not found' }, 404, corsHeaders);
    }

    if (upload.status === 'processed') {
      return jsonResponse({ error: 'Upload already processed' }, 400, corsHeaders);
    }

    // Update status to processing
    await supabase
      .from('offline_uploads')
      .update({ status: 'processing' })
      .eq('id', uploadId);

    // Download CSV from Supabase Storage
    const filePath = upload.file_name || upload.file_path;
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('offline-conversions')
      .download(filePath);

    if (downloadError || !fileData) {
      await supabase
        .from('offline_uploads')
        .update({ status: 'failed', error_message: 'Failed to download file' })
        .eq('id', uploadId);
      return jsonResponse({ error: 'Failed to download CSV file' }, 500, corsHeaders);
    }

    // Parse CSV content
    const csvText = await fileData.text();
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      await supabase
        .from('offline_uploads')
        .update({ status: 'failed', error_message: 'CSV file is empty or has no data rows' })
        .eq('id', uploadId);
      return jsonResponse({ error: 'CSV file is empty or has no data rows' }, 400, corsHeaders);
    }

    // Get all campaigns for matching
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, external_id, cost')
      .eq('organization_id', organizationId)
      .eq('platform', 'google_ads');

    let totalRows = 0;
    let matchedRows = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const email = row.email?.trim();
        const revenue = parseFloat(row.revenue || '0');
        const date = row.date?.trim() || new Date().toISOString();
        const orderId = row.order_id?.trim() || `offline-${crypto.randomUUID()}`;
        const utmSource = row.utm_source?.trim() || 'offline';
        const utmCampaign = row.utm_campaign?.trim() || null;

        if (!email && !orderId) {
          errors.push(`Row ${totalRows + 1}: missing email and order_id`);
          continue;
        }

        // Insert into utmify_sales
        const { data: sale, error: saleError } = await supabase
          .from('utmify_sales')
          .upsert({
            organization_id: organizationId,
            order_id: orderId,
            status: 'paid',
            revenue,
            currency: 'BRL',
            customer_email: email || null,
            sale_date: date,
            utm_source: utmSource,
            utm_campaign: utmCampaign,
            src: 'offline',
            received_at: new Date().toISOString(),
            raw_payload: { source: 'offline_csv', uploadId },
          }, {
            onConflict: 'organization_id,order_id',
          })
          .select('id')
          .single();

        if (saleError) {
          errors.push(`Row ${totalRows + 1}: ${saleError.message}`);
          totalRows++;
          continue;
        }

        totalRows++;

        // Campaign matching via utm_campaign
        let matchedCampaignId: string | null = null;

        if (utmCampaign && campaigns && campaigns.length > 0) {
          // Try exact name match
          const exactMatch = campaigns.find(
            (c: any) => c.name.toLowerCase() === utmCampaign.toLowerCase()
          );
          if (exactMatch) {
            matchedCampaignId = exactMatch.id;
          } else {
            // Try partial match
            const partialMatch = campaigns.find(
              (c: any) =>
                c.name.toLowerCase().includes(utmCampaign.toLowerCase()) ||
                utmCampaign.toLowerCase().includes(c.name.toLowerCase())
            );
            if (partialMatch) {
              matchedCampaignId = partialMatch.id;
            }
          }
        }

        if (matchedCampaignId && sale) {
          await supabase
            .from('utmify_sales')
            .update({ matched_campaign_id: matchedCampaignId, match_confidence: 0.7 })
            .eq('id', sale.id);
          matchedRows++;
        }
      } catch (rowError: any) {
        errors.push(`Row ${totalRows + 1}: ${rowError.message}`);
        totalRows++;
      }
    }

    // Recalculate ROAS for all matched campaigns
    if (campaigns) {
      const matchedCampaignIds = new Set<string>();
      // Collect unique matched campaign IDs from this batch
      const { data: matchedSales } = await supabase
        .from('utmify_sales')
        .select('matched_campaign_id')
        .eq('organization_id', organizationId)
        .not('matched_campaign_id', 'is', null)
        .eq('status', 'paid');

      if (matchedSales) {
        for (const s of matchedSales) {
          if (s.matched_campaign_id) matchedCampaignIds.add(s.matched_campaign_id);
        }
      }

      for (const campaignId of matchedCampaignIds) {
        const { data: salesForCampaign } = await supabase
          .from('utmify_sales')
          .select('revenue')
          .eq('matched_campaign_id', campaignId)
          .eq('status', 'paid');

        if (salesForCampaign) {
          const realSalesCount = salesForCampaign.length;
          const realRevenue = salesForCampaign.reduce((sum: number, s: any) => sum + Number(s.revenue), 0);
          const campaign = campaigns.find((c: any) => c.id === campaignId);
          const cost = Number(campaign?.cost || 0);
          const realRoas = cost > 0 ? realRevenue / cost : 0;
          const realCpa = realSalesCount > 0 ? cost / realSalesCount : 0;

          await supabase
            .from('campaigns')
            .update({
              real_sales_count: realSalesCount,
              real_revenue: realRevenue,
              real_roas: Math.round(realRoas * 100) / 100,
              real_cpa: Math.round(realCpa * 100) / 100,
            })
            .eq('id', campaignId);
        }
      }
    }

    // Update the offline_upload record
    await supabase
      .from('offline_uploads')
      .update({
        status: 'processed',
        matched_rows: matchedRows,
        total_rows: totalRows,
        processed_at: new Date().toISOString(),
        error_message: errors.length > 0 ? errors.join('; ') : null,
      })
      .eq('id', uploadId);

    return jsonResponse({
      success: true,
      totalRows,
      matchedRows,
      errors: errors.length > 0 ? errors : undefined,
    }, 200, corsHeaders);

  } catch (error: any) {
    console.error('Process offline conversions error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});

/**
 * Parse CSV text into array of objects using first row as headers.
 * Handles quoted fields with commas and newlines.
 */
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j].toLowerCase().trim();
      row[header] = values[j] || '';
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}
