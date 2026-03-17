import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getWebhookCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';

/**
 * GrowthOS — Tracking Script Endpoint
 * Receives events from the GrowthOS tracking pixel installed on client websites.
 * Captures: page views, form submissions, button clicks, UTMs, click IDs (gclid, fbclid)
 *
 * Client-side script sends events here via POST.
 * This is a PUBLIC endpoint (no auth) — identified by org API key.
 */

serve(async (req) => {
  const corsHeaders = getWebhookCorsHeaders();
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  // Serve the tracking script itself
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('id');

    const script = `
(function(w,d,o){
  var g=w.growthOS=w.growthOS||{};
  g.orgId=o;
  g.queue=[];
  g.track=function(e,p){g.queue.push({event:e,props:p,ts:Date.now()})};

  // Get UTM params and click IDs from URL
  var params=new URLSearchParams(w.location.search);
  g.utm={
    source:params.get('utm_source'),
    medium:params.get('utm_medium'),
    campaign:params.get('utm_campaign'),
    content:params.get('utm_content'),
    term:params.get('utm_term'),
    gclid:params.get('gclid'),
    fbclid:params.get('fbclid'),
    src:params.get('src'),
    sck:params.get('sck')
  };

  // Generate or retrieve visitor ID
  var vid=localStorage.getItem('gos_vid');
  if(!vid){vid=crypto.randomUUID();localStorage.setItem('gos_vid',vid)}
  g.visitorId=vid;

  // Session ID (30min expiry)
  var sid=sessionStorage.getItem('gos_sid');
  if(!sid){sid=crypto.randomUUID();sessionStorage.setItem('gos_sid',sid)}
  g.sessionId=sid;

  // Store UTMs in localStorage for persistence
  if(g.utm.source){localStorage.setItem('gos_utm',JSON.stringify(g.utm))}
  else{try{g.utm=JSON.parse(localStorage.getItem('gos_utm')||'{}')}catch(e){}}

  // Auto-track page view
  g.track('page_view',{url:w.location.href,referrer:d.referrer,title:d.title});

  // Flush events to server
  function flush(){
    if(!g.queue.length)return;
    var events=g.queue.splice(0,g.queue.length);
    var endpoint='${Deno.env.get('SUPABASE_URL')}/functions/v1/tracking-script';
    navigator.sendBeacon(endpoint+'?action=event&id='+o,JSON.stringify({
      visitorId:g.visitorId,sessionId:g.sessionId,utm:g.utm,
      events:events,device:navigator.userAgent,
      screen:w.screen.width+'x'+w.screen.height
    }));
  }

  // Flush on page unload and every 5 seconds
  w.addEventListener('beforeunload',flush);
  setInterval(flush,5000);

  // Track scroll depth
  var maxScroll=0;
  w.addEventListener('scroll',function(){
    var h=d.documentElement;
    var pct=Math.round((w.scrollY/(h.scrollHeight-h.clientHeight))*100);
    if(pct>maxScroll){maxScroll=pct;if(maxScroll%25===0)g.track('scroll_depth',{depth:maxScroll})}
  });

  // Track time on page
  var startTime=Date.now();
  w.addEventListener('beforeunload',function(){
    g.track('time_on_page',{seconds:Math.round((Date.now()-startTime)/1000)});
  });
})(window,document,'${orgId}');
`;

    return new Response(script, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // POST — Receive tracking events
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('id');

    if (!orgId) {
      return jsonResponse({ error: 'Missing org id' }, 400, corsHeaders);
    }

    const payload = await req.json();
    const { visitorId, sessionId, utm, events, device } = payload;

    // Parse device info
    const isMobile = /mobile/i.test(device || '');
    const browser = /chrome/i.test(device) ? 'Chrome' :
      /firefox/i.test(device) ? 'Firefox' :
      /safari/i.test(device) ? 'Safari' : 'Other';

    // Save each event
    const eventRecords = (events || []).map((e: any) => ({
      organization_id: orgId,
      event_name: e.event,
      visitor_id: visitorId,
      session_id: sessionId,
      utm_source: utm?.source || null,
      utm_medium: utm?.medium || null,
      utm_campaign: utm?.campaign || null,
      utm_content: utm?.content || null,
      utm_term: utm?.term || null,
      page_url: e.props?.url || null,
      referrer: e.props?.referrer || null,
      device: isMobile ? 'mobile' : 'desktop',
      browser,
      timestamp: new Date(e.ts || Date.now()).toISOString(),
    }));

    if (eventRecords.length > 0) {
      await supabase.from('tracking_events').insert(eventRecords);
    }

    // If gclid present, save for attribution
    if (utm?.gclid) {
      // Store for later matching with offline conversions
      await supabase.from('tracking_events').insert({
        organization_id: orgId,
        event_name: 'gclid_capture',
        visitor_id: visitorId,
        session_id: sessionId,
        utm_source: 'google',
        utm_campaign: utm?.campaign,
        page_url: events?.[0]?.props?.url,
        device: isMobile ? 'mobile' : 'desktop',
        timestamp: new Date().toISOString(),
      });
    }

    return jsonResponse({ ok: true, received: eventRecords.length }, 200, corsHeaders);
  } catch (error) {
    console.error('Tracking error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
