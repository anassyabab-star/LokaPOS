// ━━━ Cup Label Sticker Builder ━━━
// Generates HTML for thermal label printer (50x30mm sticker)
// Includes QR code that encodes the order URL for scanning

export type CupLabelItem = {
  name: string;
  variant_name?: string | null;
  addon_names?: string[];
  sugar_level?: string | null;
  qty: number;
  item_index: number; // 1-based: "1 of 3"
  total_items: number;
};

export type CupLabelPayload = {
  receiptNumber: string;
  customerName?: string | null;
  createdAt: string;
  orderId: string;
  item: CupLabelItem;
  siteUrl?: string; // for QR code URL
  autoPrint?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildCupLabelHtml(payload: CupLabelPayload) {
  const { receiptNumber, customerName, createdAt, orderId, item } = payload;

  const time = new Date(createdAt);
  const timeLabel = Number.isNaN(time.getTime())
    ? ""
    : time.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" });

  const drinkName = item.variant_name
    ? `${item.name} (${item.variant_name})`
    : item.name;

  const addons =
    item.addon_names && item.addon_names.length > 0
      ? `+ ${item.addon_names.join(", ")}`
      : "";

  const sugar = item.sugar_level || "";
  const customer = customerName || "Walk-in";
  const itemLabel =
    item.total_items > 1
      ? `${item.item_index}/${item.total_items}`
      : "";
  const qtyLabel = item.qty > 1 ? `×${item.qty}` : "";

  // QR code data — encode full URL so scanning opens order in POS
  const qrData = payload.siteUrl
    ? `${payload.siteUrl}/pos?order=${orderId}`
    : orderId;

  const autoPrintScript = payload.autoPrint
    ? `<script>window.addEventListener("load",()=>{window.print();window.onafterprint=()=>window.close();});</script>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cup Label ${escapeHtml(receiptNumber)}</title>
<style>
  :root { color-scheme: light; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    background: #fff;
    color: #111;
  }
  .label {
    width: 50mm;
    height: 30mm;
    padding: 1.5mm 2mm;
    display: flex;
    gap: 1.5mm;
    overflow: hidden;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .order-line {
    display: flex;
    align-items: center;
    gap: 1.5mm;
  }
  .order-num {
    font-size: 8pt;
    font-weight: 800;
    letter-spacing: -0.3px;
  }
  .item-badge {
    font-size: 5.5pt;
    font-weight: 600;
    background: #111;
    color: #fff;
    border-radius: 2px;
    padding: 0.3mm 1mm;
  }
  .qty-badge {
    font-size: 5.5pt;
    font-weight: 700;
    background: #7F1D1D;
    color: #fff;
    border-radius: 2px;
    padding: 0.3mm 1mm;
  }
  .drink {
    font-size: 7.5pt;
    font-weight: 700;
    line-height: 1.2;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .addons {
    font-size: 5.5pt;
    color: #7F1D1D;
    font-weight: 600;
    line-height: 1.2;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .sugar {
    font-size: 6pt;
    font-weight: 700;
    background: #f5f5f5;
    border: 0.5px solid #ddd;
    border-radius: 2px;
    padding: 0.3mm 1.2mm;
    display: inline-block;
  }
  .bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1mm;
  }
  .customer {
    font-size: 6pt;
    font-weight: 600;
    color: #333;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 22mm;
  }
  .time {
    font-size: 5pt;
    color: #888;
    white-space: nowrap;
  }
  .qr-area {
    width: 14mm;
    height: 14mm;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: center;
  }
  .qr-area canvas, .qr-area svg {
    width: 14mm !important;
    height: 14mm !important;
  }
  @media print {
    @page {
      size: 50mm 30mm;
      margin: 0;
    }
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
<div class="label">
  <div class="info">
    <div>
      <div class="order-line">
        <span class="order-num">#${escapeHtml(receiptNumber)}</span>
        ${itemLabel ? `<span class="item-badge">${escapeHtml(itemLabel)}</span>` : ""}
        ${qtyLabel ? `<span class="qty-badge">${escapeHtml(qtyLabel)}</span>` : ""}
      </div>
      <div class="drink">${escapeHtml(drinkName)}</div>
      ${addons ? `<div class="addons">${escapeHtml(addons)}</div>` : ""}
    </div>
    <div>
      ${sugar ? `<div style="margin-bottom:0.5mm"><span class="sugar">${escapeHtml(sugar)}</span></div>` : ""}
      <div class="bottom">
        <span class="customer">${escapeHtml(customer)}</span>
        <span class="time">${escapeHtml(timeLabel)}</span>
      </div>
    </div>
  </div>
  <div class="qr-area" id="qr"></div>
</div>

<script>
// Minimal QR Code generator (inline, no external deps)
// Based on qr-creator by nicol.as — MIT License
(function(){function g(t){var e=[];for(var r=0;r<t.length;r++){var n=t.charCodeAt(r);n<128?e.push(n):n<2048?e.push(192|n>>6,128|63&n):n<55296||n>=57344?e.push(224|n>>12,128|n>>6&63,128|63&n):(r++,n=65536+((1023&n)<<10|1023&t.charCodeAt(r)),e.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return e}function p(d){var b=1;for(var s=d.length;;b++){var c=16*b-12;if(c>=s)break}var z=b,v=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]][z-1]||[];var n=4*z+17;var m=[];for(var i=0;i<n;i++){m[i]=[];for(var j=0;j<n;j++)m[i][j]=null}function S(r,c,v){m[r][c]=v}function q(r,c){return m[r][c]}function R(row,col,size){for(var r=-1;r<=size;r++)for(var c=-1;c<=size;c++){var dr=row+r,dc=col+c;if(dr>=0&&dr<n&&dc>=0&&dc<n)S(dr,dc,r>=0&&r<size&&c>=0&&c<size&&(r==0||r==size-1||c==0||c==size-1||r==2&&c>=2&&c<=size-3||c==2&&r>=2&&r<=size-3)?1:0)}}R(0,0,7);R(n-7,0,7);R(0,n-7,7);for(var i=0;i<v.length;i++)for(var j=0;j<v.length;j++){if(q(v[i],v[j])!==null)continue;R(v[i]-2,v[j]-2,5)}for(var i=8;i<n-8;i++){if(q(6,i)===null)S(6,i,i%2==0?1:0);if(q(i,6)===null)S(i,6,i%2==0?1:0)}S(n-8,8,1);for(var i=0;i<15;i++){var bit=1;if(i<6)S(8,i,bit);else if(i<8)S(8,i+1,bit);else S(8,n-15+i,bit);if(i<8)S(n-1-i,8,bit);else if(i<9)S(15-i,8,bit);else S(14-i,8,bit)}var D=g(d);var ec=[];var capacity=16*z-12;while(D.length<capacity)D.push(236,17);var bits=[];for(var i=0;i<D.length;i++)for(var bit=7;bit>=0;bit--)bits.push((D[i]>>bit)&1);var bi=0;for(var right=n-1;right>=1;right-=2){if(right==6)right=5;for(var vert=0;vert<n;vert++){for(var j=0;j<2;j++){var col=right-j;var up=((right+1)>>1&1)==0;var row=up?n-1-vert:vert;if(q(row,col)===null){S(row,col,bi<bits.length?bits[bi]:0);bi++}}}}for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(q(r,c)===null)S(r,c,0);return{size:n,get:function(r,c){return m[r]&&m[r][c]?1:0}}}
try{
  var qr=p("${qrData.replace(/"/g, '\\"')}");
  var el=document.getElementById("qr");
  var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+qr.size+" "+qr.size+'">';
  for(var r=0;r<qr.size;r++)for(var c=0;c<qr.size;c++)if(qr.get(r,c))svg+='<rect x="'+c+'" y="'+r+'" width="1" height="1"/>';
  svg+="</svg>";
  el.innerHTML=svg;
}catch(e){
  document.getElementById("qr").textContent="QR";
}
})();
</script>
${autoPrintScript}
</body>
</html>`;
}

// Build multiple labels for one order (1 label PER CUP, not per item line)
// e.g. Teh Tarik x2 = 2 separate sticker labels
export function buildAllCupLabelsHtml(payload: {
  receiptNumber: string;
  customerName?: string | null;
  createdAt: string;
  orderId: string;
  items: Array<{
    name: string;
    variant_name?: string | null;
    addon_names?: string[];
    sugar_level?: string | null;
    qty: number;
  }>;
  siteUrl?: string;
  autoPrint?: boolean;
}) {
  // Expand items by qty: Teh Tarik x2 → 2 separate entries
  const expandedItems: Array<{
    name: string;
    variant_name?: string | null;
    addon_names?: string[];
    sugar_level?: string | null;
  }> = [];
  for (const item of payload.items) {
    const count = Math.max(1, Math.floor(item.qty));
    for (let i = 0; i < count; i++) {
      expandedItems.push({
        name: item.name,
        variant_name: item.variant_name,
        addon_names: item.addon_names,
        sugar_level: item.sugar_level,
      });
    }
  }

  const totalCups = expandedItems.length;

  const labelPages = expandedItems.map((item, idx) =>
    buildCupLabelHtml({
      receiptNumber: payload.receiptNumber,
      customerName: payload.customerName,
      createdAt: payload.createdAt,
      orderId: payload.orderId,
      siteUrl: payload.siteUrl,
      autoPrint: false,
      item: {
        name: item.name,
        variant_name: item.variant_name,
        addon_names: item.addon_names,
        sugar_level: item.sugar_level,
        qty: 1,
        item_index: idx + 1,
        total_items: totalCups,
      },
    })
  );

  // Extract just the <div class="label"> content from each page
  const labels = labelPages
    .map((html) => {
      const match = html.match(/<div class="label">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
      return match ? match[0] : "";
    })
    .filter(Boolean);

  const autoPrintScript = payload.autoPrint
    ? `<script>window.addEventListener("load",()=>{window.print();window.onafterprint=()=>window.close();});</script>`
    : "";

  // For QR script, embed once and generate for each label
  const qrIds = expandedItems.map((_, i) => `qr-${i}`);

  const labelsHtml = expandedItems
    .map((item, idx) => {
      const drinkName = item.variant_name
        ? `${item.name} (${item.variant_name})`
        : item.name;
      const addons =
        item.addon_names && item.addon_names.length > 0
          ? `+ ${item.addon_names.join(", ")}`
          : "";
      const sugar = item.sugar_level || "";
      const customer = payload.customerName || "Walk-in";
      const time = new Date(payload.createdAt);
      const timeLabel = Number.isNaN(time.getTime())
        ? ""
        : time.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" });
      const itemLabel = totalCups > 1 ? `${idx + 1}/${totalCups}` : "";

      return `
    <div class="label">
      <div class="info">
        <div>
          <div class="order-line">
            <span class="order-num">#${escapeHtml(payload.receiptNumber)}</span>
            ${itemLabel ? `<span class="item-badge">${escapeHtml(itemLabel)}</span>` : ""}
          </div>
          <div class="drink">${escapeHtml(drinkName)}</div>
          ${addons ? `<div class="addons">${escapeHtml(addons)}</div>` : ""}
        </div>
        <div>
          ${sugar ? `<div style="margin-bottom:0.5mm"><span class="sugar">${escapeHtml(sugar)}</span></div>` : ""}
          <div class="bottom">
            <span class="customer">${escapeHtml(customer)}</span>
            <span class="time">${escapeHtml(timeLabel)}</span>
          </div>
        </div>
      </div>
      <div class="qr-area" id="${qrIds[idx]}"></div>
    </div>`;
    })
    .join("\n    <div style=\"page-break-after:always\"></div>\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cup Labels ${escapeHtml(payload.receiptNumber)}</title>
<style>
  :root { color-scheme: light; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #fff; color: #111; }
  .label { width: 50mm; height: 30mm; padding: 1.5mm 2mm; display: flex; gap: 1.5mm; overflow: hidden; page-break-inside: avoid; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
  .order-line { display: flex; align-items: center; gap: 1.5mm; }
  .order-num { font-size: 8pt; font-weight: 800; letter-spacing: -0.3px; }
  .item-badge { font-size: 5.5pt; font-weight: 600; background: #111; color: #fff; border-radius: 2px; padding: 0.3mm 1mm; }
  .qty-badge { font-size: 5.5pt; font-weight: 700; background: #7F1D1D; color: #fff; border-radius: 2px; padding: 0.3mm 1mm; }
  .drink { font-size: 7.5pt; font-weight: 700; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .addons { font-size: 5.5pt; color: #7F1D1D; font-weight: 600; line-height: 1.2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .sugar { font-size: 6pt; font-weight: 700; background: #f5f5f5; border: 0.5px solid #ddd; border-radius: 2px; padding: 0.3mm 1.2mm; display: inline-block; }
  .bottom { display: flex; align-items: center; justify-content: space-between; gap: 1mm; }
  .customer { font-size: 6pt; font-weight: 600; color: #333; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 22mm; }
  .time { font-size: 5pt; color: #888; white-space: nowrap; }
  .qr-area { width: 14mm; height: 14mm; flex-shrink: 0; display: flex; align-items: center; justify-content: center; align-self: center; }
  .qr-area svg { width: 14mm !important; height: 14mm !important; }
  @media print { @page { size: 50mm 30mm; margin: 0; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
    ${labelsHtml}
<script>
(function(){function g(t){var e=[];for(var r=0;r<t.length;r++){var n=t.charCodeAt(r);n<128?e.push(n):n<2048?e.push(192|n>>6,128|63&n):n<55296||n>=57344?e.push(224|n>>12,128|n>>6&63,128|63&n):(r++,n=65536+((1023&n)<<10|1023&t.charCodeAt(r)),e.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return e}function p(d){var b=1;for(var s=d.length;;b++){var c=16*b-12;if(c>=s)break}var z=b,v=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]][z-1]||[];var n=4*z+17;var m=[];for(var i=0;i<n;i++){m[i]=[];for(var j=0;j<n;j++)m[i][j]=null}function S(r,c,v){m[r][c]=v}function q(r,c){return m[r][c]}function R(row,col,size){for(var r=-1;r<=size;r++)for(var c=-1;c<=size;c++){var dr=row+r,dc=col+c;if(dr>=0&&dr<n&&dc>=0&&dc<n)S(dr,dc,r>=0&&r<size&&c>=0&&c<size&&(r==0||r==size-1||c==0||c==size-1||r==2&&c>=2&&c<=size-3||c==2&&r>=2&&r<=size-3)?1:0)}}R(0,0,7);R(n-7,0,7);R(0,n-7,7);for(var i=0;i<v.length;i++)for(var j=0;j<v.length;j++){if(q(v[i],v[j])!==null)continue;R(v[i]-2,v[j]-2,5)}for(var i=8;i<n-8;i++){if(q(6,i)===null)S(6,i,i%2==0?1:0);if(q(i,6)===null)S(i,6,i%2==0?1:0)}S(n-8,8,1);for(var i=0;i<15;i++){var bit=1;if(i<6)S(8,i,bit);else if(i<8)S(8,i+1,bit);else S(8,n-15+i,bit);if(i<8)S(n-1-i,8,bit);else if(i<9)S(15-i,8,bit);else S(14-i,8,bit)}var D=g(d);var capacity=16*z-12;while(D.length<capacity)D.push(236,17);var bits=[];for(var i=0;i<D.length;i++)for(var bit=7;bit>=0;bit--)bits.push((D[i]>>bit)&1);var bi=0;for(var right=n-1;right>=1;right-=2){if(right==6)right=5;for(var vert=0;vert<n;vert++){for(var j=0;j<2;j++){var col=right-j;var up=((right+1)>>1&1)==0;var row=up?n-1-vert:vert;if(q(row,col)===null){S(row,col,bi<bits.length?bits[bi]:0);bi++}}}}for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(q(r,c)===null)S(r,c,0);return{size:n,get:function(r,c){return m[r]&&m[r][c]?1:0}}}
try{
  var ids=${JSON.stringify(qrIds)};
  var data="${(payload.siteUrl ? `${payload.siteUrl}/pos?order=${payload.orderId}` : payload.orderId).replace(/"/g, '\\"')}";
  var qr=p(data);
  var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+qr.size+" "+qr.size+'">';
  for(var r=0;r<qr.size;r++)for(var c=0;c<qr.size;c++)if(qr.get(r,c))svg+='<rect x="'+c+'" y="'+r+'" width="1" height="1"/>';
  svg+="</svg>";
  ids.forEach(function(id){var el=document.getElementById(id);if(el)el.innerHTML=svg;});
}catch(e){console.error("QR error",e)}
})();
</script>
${autoPrintScript}
</body>
</html>`;
}
