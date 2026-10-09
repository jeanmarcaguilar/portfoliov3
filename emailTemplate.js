/* -------------------------------------------------------------------------- */
/*  Visitor notification email – "Aurora" design                              */
/*  Table-based layout + inline styles so it renders well in Gmail & others.  */
/* -------------------------------------------------------------------------- */

export const TIME_ZONE = process.env.EMAIL_TIMEZONE || 'Asia/Manila';

const C = {
  // Light theme colors (matching portfolio)
  page: '#F4F4ED',
  cardStart: 'rgba(255, 255, 255, 0.97)',
  cardEnd: 'rgba(186, 209, 255, 0.96)',
  cardMid1: 'rgba(255, 255, 255, 0.93)',
  cardMid2: 'rgba(219, 231, 255, 0.95)',
  tile: '#F8FAFC',
  border: '#E2E8F0',
  text: '#0F172A',
  muted: '#64748B',
  navy: '#0C1226',
  cream: '#F4F4ED',
  orange: '#FF7A1A',
  orangeInk: '#C95C00',
  shadow: 'rgba(6, 12, 26, 0.5)',
};

const FONT = `'Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif`;
const MONO = `'SF Mono',Consolas,Menlo,monospace`;

// Escape user-supplied values before putting them in HTML
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const joinParts = (parts, sep = ' ') => parts.filter(Boolean).map(esc).join(sep);

// 2-letter country code -> flag emoji (falls back to a globe)
const flagFor = (code) => {
  const c = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '🌍';
  return String.fromCodePoint(...[...c].map((ch) => 127397 + ch.charCodeAt(0)));
};

const deviceIcon = (type) => {
  const t = String(type || '').toLowerCase();
  if (t.includes('mobile') || t.includes('phone')) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>`;
  }
  if (t.includes('tablet')) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>`;
  }
  return `<svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor"><path d="M224,72H208V64a24,24,0,0,0-24-24H40A24,24,0,0,0,16,64v96a24,24,0,0,0,24,24H152v8a24,24,0,0,0,24,24h48a24,24,0,0,0,24-24V96A24,24,0,0,0,224,72ZM40,168a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H184a8,8,0,0,1,8,8v8H176a24,24,0,0,0-24,24v72Zm192,24a8,8,0,0,1-8,8H176a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8Zm-96,16a8,8,0,0,1-8,8H88a8,8,0,0,1,0-16h40A8,8,0,0,1,136,208Zm80-96a8,8,0,0,1-8,8H192a8,8,0,0,1,0-16h16A8,8,0,0,1,216,112Z"/></svg>`;
};

const label = (text, color = C.muted) =>
  `<div style="font-size:10px;letter-spacing:2.2px;text-transform:uppercase;color:${color};font-weight:700;">${text}</div>`;

const spacer = (h) =>
  `<div style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</div>`;

// Pill badge
const pill = (icon, text, tint, textColor) => `
  <td style="padding:0 8px 8px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:${tint};border:1px solid ${C.border};border-radius:999px;padding:9px 16px;
          font-size:13px;font-weight:600;color:${textColor};white-space:nowrap;">${icon}&nbsp; ${text}</td>
      </tr>
    </table>
  </td>`;

// Info card with a coloured top edge
const card = (icon, title, value, accent, mono = false) => `
  <td width="50%" valign="top" style="padding:6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:${C.tile};border:1px solid ${C.border};border-radius:18px;overflow:hidden;">
      <tr><td height="3" style="height:3px;line-height:3px;font-size:0;background:${accent};">&nbsp;</td></tr>
      <tr>
        <td style="padding:18px;">
          <div style="font-size:22px;line-height:1;">${icon}</div>
          ${spacer(12)}
          ${label(title)}
          <div style="font-size:${mono ? 14 : 16}px;color:${C.text};font-weight:700;margin-top:6px;line-height:1.4;
            ${mono ? `font-family:${MONO};` : ''}word-break:break-all;">${value}</div>
        </td>
      </tr>
    </table>
  </td>`;

export const buildEmailHtml = (v = {}) => {
  const loc = v.location || {};
  const flag = flagFor(loc.countryCode || loc.country_code);
  const cityLine = esc(loc.city || loc.country || 'Somewhere on Earth');
  const subLocation = joinParts([loc.region, loc.country], ', ');

  const hasCoords = typeof loc.latitude === 'number' && typeof loc.longitude === 'number';
  const mapUrl = hasCoords ? `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}` : null;

  const deviceName = joinParts([v.device?.vendor, v.device?.model]) || esc(v.device?.type || 'Desktop');
  const osText = joinParts([v.os?.name || 'Unknown', v.os?.version]);
  const browserText = joinParts([v.browser?.name || 'Unknown', v.browser?.version]);

  const parsed = v.timestamp ? new Date(v.timestamp) : new Date();
  const visit = isNaN(parsed.getTime()) ? new Date() : parsed;
  const visitDate = visit.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TIME_ZONE,
  });
  const visitClock = visit.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE,
  });

  const mapButton = mapUrl
    ? `${spacer(20)}
       <table role="presentation" cellpadding="0" cellspacing="0" border="0">
         <tr>
           <td bgcolor="${C.orange}" style="background:${C.orange};border-radius:14px;">
             <a href="${mapUrl}" style="display:inline-block;padding:13px 24px;font-size:13px;font-weight:700;
               color:#ffffff;text-decoration:none;letter-spacing:0.4px;">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:text-bottom;margin-right:4px;">
                 <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
               </svg>
               Open in Google Maps &rarr;
             </a>
           </td>
         </tr>
       </table>
       <div style="font-size:11px;color:${C.muted};margin-top:12px;font-family:${MONO};">
         ${loc.latitude.toFixed(4)}° N &nbsp;/&nbsp; ${loc.longitude.toFixed(4)}° E</div>`
    : '';

  const preheader = `${flag} ${cityLine}${subLocation ? ', ' + subLocation : ''} · ${esc(visitClock)}`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
  </head>
  <body style="margin:0;padding:0;background:${C.page};font-family:${FONT};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}"
      style="background:${C.page};">
      <tr>
        <td align="center" style="padding:44px 12px;">

          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
            style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.border};border-radius:30px;overflow:hidden;">

            <!-- Hero -->
            <tr>
              <td bgcolor="#5b21b6" align="left"
                style="background:#5b21b6;background-image:linear-gradient(135deg,#1e1b4b 0%,#5b21b6 40%,#be185d 80%,#f97316 120%);padding:40px 36px 36px 36px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.28);border-radius:999px;padding:8px 16px;
                      font-size:10px;letter-spacing:2.2px;text-transform:uppercase;font-weight:700;color:#ffffff;">
                      <span style="color:#86efac;">●</span>&nbsp; New visitor
                    </td>
                  </tr>
                </table>
                ${spacer(22)}
                <div style="font-size:34px;font-weight:800;color:#ffffff;letter-spacing:-1px;line-height:1.1;">
                  Hey, someone's<br>checking you out 👀
                </div>
                ${spacer(24)}
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:40px;font-weight:800;color:#ffffff;letter-spacing:-1.5px;line-height:1;padding-right:14px;
                      border-right:2px solid rgba(255,255,255,0.35);">${esc(visitClock)}</td>
                    <td style="padding-left:14px;font-size:13px;line-height:1.5;color:rgba(255,255,255,0.85);">
                      ${esc(visitDate)}<br><span style="color:rgba(255,255,255,0.6);">${esc(TIME_ZONE.replace('_', ' '))}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Rainbow strip -->
            <tr>
              <td height="3" style="height:3px;line-height:3px;font-size:0;background:${C.violet};background-image:linear-gradient(90deg,#6366f1,#a855f7,${C.pink},#fb923c,${C.cyan});">&nbsp;</td>
            </tr>

            <!-- Location -->
            <tr>
              <td style="padding:34px 36px 8px 36px;">
                ${label('Visiting from', C.violetSoft)}
                ${spacer(10)}
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle" style="font-size:46px;line-height:1;padding-right:16px;">${flag}</td>
                    <td valign="middle">
                      <div style="font-size:30px;font-weight:800;color:${C.text};letter-spacing:-0.6px;line-height:1.15;">${cityLine}</div>
                      ${subLocation ? `<div style="font-size:14px;color:${C.muted};margin-top:5px;">${subLocation}</div>` : ''}
                    </td>
                  </tr>
                </table>
                ${mapButton}
              </td>
            </tr>

            <!-- Pills -->
            <tr>
              <td style="padding:26px 36px 4px 36px;">
                ${label('Using')}
                ${spacer(12)}
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    ${pill(deviceIcon(v.device?.type), deviceName, 'rgba(139,92,246,0.14)', C.violetSoft)}
                    ${pill('🪟', osText, 'rgba(103,232,249,0.10)', C.cyan)}
                    ${pill('🧭', browserText, 'rgba(244,114,182,0.12)', '#fbcfe8')}
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Cards -->
            <tr>
              <td style="padding:14px 30px 6px 30px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    ${card('🖥️', 'Screen', esc(v.screenResolution || 'Unknown'), C.mint)}
                    ${card('🌐', 'IP Address', esc(v.ip || 'Unknown'), C.amber, true)}
                  </tr>
                </table>
              </td>
            </tr>

            <!-- User agent -->
            <tr>
              <td style="padding:16px 36px 36px 36px;">
                ${label('User Agent')}
                <div style="background:${C.page};border:1px solid ${C.border};border-left:3px solid ${C.violet};border-radius:12px;margin-top:10px;
                  padding:14px 16px;font-family:${MONO};font-size:11.5px;line-height:1.7;
                  color:${C.violetSoft};word-break:break-all;">${esc(v.userAgent || 'Unknown')}</div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td align="center" style="border-top:1px solid ${C.border};padding:24px 36px;">
                <div style="font-size:12px;color:${C.muted};">Sent automatically by your portfolio tracker 💜</div>
                <div style="font-size:11px;color:#545985;margin-top:6px;">
                  Generated ${esc(new Date().toLocaleString('en-US', { timeZone: TIME_ZONE }))}</div>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`;
};