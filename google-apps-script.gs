/**
 * Oxygen Forest - Google Apps Script Webhook with OpenAI Conversions API (CAPI) Integration
 * 
 * Setup instructions:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace the script content with this code
 * 4. Click Deploy > New deployment > Select type: Web app
 * 5. Set "Execute as": Me
 * 6. Set "Who has access": Anyone
 * 7. Click Deploy and copy the Web App URL (matches LEAD_WEBHOOK_URL)
 */

// In Apps Script, set OPENAI_CAPI_KEY in Project Settings > Script Properties, or replace with your key:
var OPENAI_CAPI_KEY = PropertiesService.getScriptProperties().getProperty('OPENAI_CAPI_KEY') || 'sk-svcacct-YOUR_KEY_HERE';
var OPENAI_PIXEL_ID = 'TSqRGgfEN8Dvdh1CyRhTrx';

function doPost(e) {
  try {
    var params = {};
    if (e.postData && e.postData.contents) {
      if (e.postData.type && e.postData.type.indexOf('application/json') !== -1) {
        try {
          params = JSON.parse(e.postData.contents);
        } catch (err) {
          params = e.parameter || {};
        }
      } else {
        params = e.parameter || {};
      }
    } else {
      params = e.parameter || {};
    }

    var timestamp = params.ts || new Date().toISOString();
    var name = params.name || '';
    var phone = params.phone || '';
    var purpose = params.purpose || '';
    var visit = params.visit || '';
    var buyer = params.buyer || '';
    var source = params.source || '';
    var page = params.page || '';
    var gclid = params.gclid || '';
    var oppref = params.oppref || '';
    var utmSource = params.utm_source || '';
    var utmMedium = params.utm_medium || '';
    var utmCampaign = params.utm_campaign || '';
    var eventId = params.event_id || ('lead_' + new Date().getTime() + '_' + Math.random().toString(36).substring(2, 9));

    // 1. Append lead to the active Google Sheet
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Timestamp', 'Name', 'Phone', 'Purpose', 'Visit Slot', 
        'Buyer Type', 'Source', 'Page URL', 'Oppref (ChatGPT Ad Click)', 
        'Gclid', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Event ID', 'CAPI Status'
      ]);
    }

    // 2. Send conversion event to OpenAI CAPI
    var capiStatus = 'skipped';
    try {
      capiStatus = sendToOpenAICapi(phone, name, page, eventId, oppref);
    } catch (capiErr) {
      capiStatus = 'error: ' + capiErr.toString();
    }

    sheet.appendRow([
      timestamp, name, phone, purpose, visit, 
      buyer, source, page, oppref, 
      gclid, utmSource, utmMedium, utmCampaign, eventId, capiStatus
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      event_id: eventId,
      capi_status: capiStatus
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function sendToOpenAICapi(phone, name, sourceUrl, eventId, oppref) {
  if (!OPENAI_CAPI_KEY || !OPENAI_PIXEL_ID) return 'no_credentials';

  var cleanPhone = (phone || '').toString().trim().replace(/[\s()-]/g, '');
  if (cleanPhone && cleanPhone.indexOf('+') !== 0) {
    cleanPhone = cleanPhone.length === 10 ? '+91' + cleanPhone : '+' + cleanPhone;
  }

  var phoneHash = '';
  if (cleanPhone) {
    var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, cleanPhone, Utilities.Charset.UTF_8);
    phoneHash = rawHash.map(function(byte) {
      var v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');
  }

  var userData = {};
  if (cleanPhone) userData.phone_number = cleanPhone;
  if (phoneHash) userData.phone_number_sha256 = phoneHash;
  if (name) userData.first_name = name;

  var eventObj = {
    id: eventId,
    timestamp_ms: new Date().getTime(),
    type: 'lead_created',
    action_source: 'web',
    source_url: sourceUrl || 'https://oxygenforest.in/',
    user: userData,
    data: {
      type: 'customer_action'
    }
  };

  if (oppref) {
    eventObj.oppref = oppref;
  }

  var payload = {
    validate_only: false,
    integration_source: 'google-apps-script',
    events: [eventObj]
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + OPENAI_CAPI_KEY
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://bzr.openai.com/v1/events?pid=' + encodeURIComponent(OPENAI_PIXEL_ID), options);
  var code = response.getResponseCode();
  return (code >= 200 && code < 300) ? 'success_200' : ('failed_' + code);
}