/**
 * sendSms
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch (e) {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const to = String(body?.to || '').trim();
    const message = String(body?.message || '').trim();

    if (!to || !message) {
      return Response.json({ error: 'Missing "to" or "message"' }, { status: 400 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      return Response.json({ error: 'Twilio credentials not configured' }, { status: 500 });
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const form = new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: message
    });

    const twilioRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form
    });

    const text = await twilioRes.text();
    if (!twilioRes.ok) {
      console.error('Twilio SMS error:', twilioRes.status, text);
      return Response.json({ error: `Twilio error: ${twilioRes.status} ${text}` }, { status: 500 });
    }

    return Response.json({ success: true, detail: JSON.parse(text) }, { status: 200 });
  } catch (error) {
    console.error('sendSms function error:', error);
    return Response.json({ error: error.message || 'Server error' }, { status: 500 });
  }
});

----------------------------

export default sendSms;
