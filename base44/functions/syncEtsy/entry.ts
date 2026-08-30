import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { calculateOrderCosts } from '../../shared/orderCost.js';
import { resolveBusinessWorkspace } from '../../shared/ownerUser.js';

const API = 'https://openapi.etsy.com/v3/application';
const START_TS = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000);

const inferSize = (name = '') => {
  const match = String(name).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return match ? match[1].replace(/\s+/g, '').replace('×', 'x') : 'Unknown';
};
const norm = (v='') => String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
function money(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v.replace(/[$,]/g,'')) || 0;
  if (typeof v === 'object') {
    const amount = Number(v.amount ?? v.value ?? 0);
    const divisor = Number(v.divisor || 100);
    return divisor ? amount / divisor : amount;
  }
  return 0;
}

async function api(path, key, secret, token) {
  const res = await fetch(`${API}${path}`, { headers: { 'x-api-key': `${key}:${secret}`, Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await res.text();
  let data={}; try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) { const e = new Error(data?.error || data?.message || `Etsy API ${res.status}`); e.status=res.status; throw e; }
  return data;
}

async function refresh(connection, key) {
  if (new Date(connection.expires_at || 0).getTime() > Date.now() + 120000) return connection;
  const form = new URLSearchParams({ grant_type:'refresh_token', client_id:key, refresh_token:connection.refresh_token || '' });
  const res = await fetch('https://api.etsy.com/v3/public/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
  const data = await res.json().catch(()=>({}));
  if (!res.ok || !data.access_token) throw new Error(data?.error_description || 'Could not refresh Etsy authorization.');
  return { ...connection, access_token:data.access_token, refresh_token:data.refresh_token || connection.refresh_token, expires_at:new Date(Date.now()+Number(data.expires_in||3600)*1000).toISOString(), scopes:data.scope || connection.scopes };
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const key = String(Deno.env.get('ETSY_API_KEY') || '').trim();
  const secret = String(Deno.env.get('ETSY_SHARED_SECRET') || '').trim();
  if (!key || !secret) return Response.json({ available:false, needs_setup:true, more_possible:false, message:'Etsy API credentials are not configured yet.' });

  let email=''; try { email=(await base44.auth.me())?.email || ''; } catch {}
  const {ownerId,businessId,accessEmails=[]}=await resolveBusinessWorkspace(base44,email);
  if (!ownerId || !businessId) return Response.json({error:'No business workspace found.'},{status:400});
  const connections=await base44.asServiceRole.entities.EtsyConnection.list('-updated_date',100);
  let conn=connections.find(x=>x.business_id===businessId && x.status==='connected');
  if (!conn) return Response.json({available:true,connected:false,more_possible:false,message:'Connect Etsy in Account settings to sync Etsy orders directly.'});

  conn=await refresh(conn,key);
  await base44.asServiceRole.entities.EtsyConnection.update(conn.id,{access_token:conn.access_token,refresh_token:conn.refresh_token,expires_at:conn.expires_at,scopes:conn.scopes});
  if (!conn.shop_id) {
    const uid=String(conn.etsy_user_id || conn.access_token.split('.')[0] || '');
    const shop=await api(`/users/${uid}/shops`,key,secret,conn.access_token);
    conn.shop_id=String(shop.shop_id||''); conn.shop_name=shop.shop_name||'';
    await base44.asServiceRole.entities.EtsyConnection.update(conn.id,{shop_id:conn.shop_id,shop_name:conn.shop_name});
  }
  if (!conn.shop_id) throw new Error('No Etsy shop was found for this account.');

  const states=await base44.asServiceRole.entities.SyncState.list('-last_synced_at',200);
  const state=states.find(s=>s.business_id===businessId && s.source==='etsy_api');
  const offset=Math.max(0,Number(state?.cursor||0));
  const receipts=await api(`/shops/${conn.shop_id}/receipts?limit=100&offset=${offset}&min_created=${START_TS}&was_canceled=false`,key,secret,conn.access_token);
  const rows=Array.isArray(receipts?.results)?receipts.results:[];
  const [existingOrders,inventory]=await Promise.all([
    base44.asServiceRole.entities.Order.list('-sale_date',5000),
    base44.asServiceRole.entities.InventoryCost.list('size',500)
  ]);
  const target=existingOrders.filter(o=>o.business_id===businessId || (!o.business_id && o.created_by_id===ownerId));
  const invs=inventory.filter(i=>i.business_id===businessId || (!i.business_id && i.created_by_id===ownerId));
  let created=0,updated=0;
  for (const receipt of rows) {
    let txs=Array.isArray(receipt.transactions)?receipt.transactions:[];
    if (!txs.length && receipt.receipt_id) {
      const r=await api(`/shops/${conn.shop_id}/receipts/${receipt.receipt_id}/transactions`,key,secret,conn.access_token);
      txs=Array.isArray(r?.results)?r.results:[];
    }
    const saleDate=new Date(Number(receipt.created_timestamp || receipt.create_timestamp || txs[0]?.created_timestamp || 0)*1000).toISOString().slice(0,10);
    for (const tx of txs) {
      const qty=Math.max(1,Number(tx.quantity)||1);
      const total=money(tx.price)*qty;
      if (!(total>0)) continue;
      const title=String(tx.title||'Etsy sale').trim();
      const receiptId=String(receipt.receipt_id||'');
      const txId=String(tx.transaction_id||norm(title));
      const sourceId=`etsy-api:${receiptId}:${txId}`;
      let existing=target.find(o=>o.source_email_id===sourceId || (o.platform==='Etsy' && receiptId && String(o.order_id||'')===receiptId && norm(o.product_name)===norm(title)));
      const size=inferSize(title); const inv=invs.find(i=>i.size===size);
      const costs=calculateOrderCosts({quantity:qty,size,unit_price:total/qty},inv);
      const sourceUrl=tx.listing_id?`https://www.etsy.com/listing/${tx.listing_id}`:null;
      const payload={business_id:businessId,access_emails:accessEmails,platform:'Etsy',order_id:receiptId,source_email_id:sourceId,sync_source:'etsy_api',sale_date:saleDate,product_name:title,quantity:qty,size,unit_price:total/qty,sale_total:total,buyer:receipt.name||receipt.buyer_email||null,source_url:sourceUrl||existing?.source_url||null,archived:false,...costs};
      if (existing) { await base44.asServiceRole.entities.Order.update(existing.id,payload); Object.assign(existing,payload); updated++; }
      else { const made=await base44.asServiceRole.entities.Order.create({...payload,created_by_id:ownerId}); target.push(made); created++; }
    }
  }
  const nextOffset=offset+rows.length;
  const more=rows.length===100;
  const payload={business_id:businessId,source:'etsy_api',last_synced_at:new Date().toISOString(),last_found:Number(receipts?.count||rows.length),last_processed:rows.length,last_created:created,last_remaining:more?1:0,status:'ok',message:more?`Etsy synced ${created} new and ${updated} updated order lines. Backfill continuing.`:`Etsy synced ${created} new and ${updated} updated order lines.`,cursor:more?String(nextOffset):'0'};
  if (state) await base44.asServiceRole.entities.SyncState.update(state.id,payload); else await base44.asServiceRole.entities.SyncState.create({...payload,created_by_id:ownerId});
  return Response.json({available:true,connected:true,created,updated,more_possible:more,remaining:more?1:0,message:payload.message});
}