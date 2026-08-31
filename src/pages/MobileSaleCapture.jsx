import React, { useMemo, useState } from "react";
import { ArrowLeft, ClipboardPaste, Send, Smartphone, CheckCircle2, Sparkles } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { artflowAuthClient } from "@/lib/artflowAuthClient";
import { useAuth } from "@/lib/AuthContext";
import { useMarketplacePreferences } from "@/lib/useMarketplacePreferences";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const clean = (value = "") => String(value || "").trim();

const detectPlatform = (value = "") => {
  if (/vinted/i.test(value)) return "Vinted";
  if (/depop/i.test(value)) return "Depop";
  if (/etsy/i.test(value)) return "Etsy";
  if (/ebay/i.test(value)) return "eBay";
  return "";
};

const findUrl = (value = "") => {
  const match = String(value).match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[),.;]+$/, "") : "";
};

const moneyNumber = (value = "") => {
  const match = String(value).match(/(?:\$|USD\s*)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
};

const findMoney = (value = "") => {
  const text = String(value || "");
  const priority = [
    /(?:order\s*total|sale\s*total|sold\s*for|item\s*price|price\s*paid|you\s*sold[^\n:]*)\s*[:\-]?\s*(?:\$|USD\s*)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /(?:total|price|amount)\s*[:\-]?\s*(?:\$|USD\s*)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
  ];
  for (const pattern of priority) {
    const match = text.match(pattern);
    if (match) return Number(match[1].replace(/,/g, "")).toFixed(2);
  }
  const amounts = [...text.matchAll(/\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return amounts.length ? Math.max(...amounts).toFixed(2) : "";
};

const findOrderId = (value = "") => {
  const patterns = [
    /(?:order(?:\s*(?:number|no\.?|id))?|transaction(?:\s*id)?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,})/i,
    /#([A-Z0-9][A-Z0-9-]{4,})/i,
  ];
  for (const pattern of patterns) {
    const match = String(value).match(pattern);
    if (match) return match[1];
  }
  return "";
};

const findBuyer = (value = "") => {
  const patterns = [
    /(?:buyer|customer|purchased\s*by|sold\s*to)\s*[:\-]\s*([^\n|]{2,80})/i,
    /(?:buyer|customer)\s+([^\n|]{2,80})/i,
  ];
  for (const pattern of patterns) {
    const match = String(value).match(pattern);
    if (match) return clean(match[1]).replace(/^@/, "");
  }
  return "";
};

const findSize = (value = "") => {
  const match = String(value || "").match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return match ? match[1].replace(/\s+/g, "").replace("×", "x") : "";
};

const findQuantity = (value = "") => {
  const patterns = [
    /(?:quantity|qty)\s*[:\-]?\s*(\d{1,2})/i,
    /(?:items?|pieces?)\s*[:\-]?\s*(\d{1,2})/i,
    /\b(\d{1,2})\s*(?:items?|pieces?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = String(value).match(pattern);
    if (match && Number(match[1]) > 0) return String(Number(match[1]));
  }
  return "1";
};

const toIsoDate = (value = "") => {
  const text = clean(value);
  if (!text) return "";
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
};

const findDate = (value = "") => {
  const text = String(value || "");
  const labeled = text.match(/(?:sold\s*(?:on)?|sale\s*date|order\s*date|date)\s*[:\-]?\s*([^\n|]{4,40})/i);
  if (labeled) {
    const result = toIsoDate(labeled[1]);
    if (result) return result;
  }
  const direct = text.match(/\b(?:20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/20\d{2})\b/);
  return direct ? toIsoDate(direct[0]) : "";
};

const findProduct = (value = "", sharedTitle = "") => {
  const text = String(value || "");
  const patterns = [
    /(?:product|item|listing|sold\s*item|item\s*name|title)\s*[:\-]\s*([^\n|]{3,180})/i,
    /(?:you\s*sold)\s*[:\-]?\s*([^\n|$]{3,180})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return clean(match[1]);
  }
  const title = clean(sharedTitle)
    .replace(/\s*[-|]\s*(?:Vinted|Depop|Etsy|eBay).*$/i, "")
    .replace(/^(?:Vinted|Depop|Etsy|eBay)\s*[-|:]\s*/i, "");
  if (title && !/^(?:vinted|depop|etsy|ebay)$/i.test(title)) return title;

  const ignored = /^(?:vinted|depop|etsy|ebay|order|order details|sold|sale|receipt|thank you|view order|view sale)$/i;
  const lines = text.split(/\r?\n/).map((line) => clean(line)).filter(Boolean);
  const candidate = lines.find((line) =>
    line.length >= 4 && line.length <= 180 &&
    !ignored.test(line) &&
    !/^https?:\/\//i.test(line) &&
    !/^(?:buyer|customer|quantity|qty|order|date|total|price|amount|shipping|fee|tax)\b/i.test(line) &&
    moneyNumber(line) === null
  );
  return candidate || "";
};

const parseDetails = ({ text = "", url = "", title = "" }) => {
  const combined = [title, text, url].filter(Boolean).join("\n");
  return {
    platform: detectPlatform(combined),
    sourceUrl: url || findUrl(combined),
    productName: findProduct(combined, title),
    saleTotal: findMoney(combined),
    orderId: findOrderId(combined),
    buyer: findBuyer(combined),
    quantity: findQuantity(combined),
    size: findSize(combined),
    saleDate: findDate(combined) || today(),
  };
};

export default function MobileSaleCapture() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selected: trackedSites, configured: sitesConfigured } = useMarketplacePreferences();
  const [params] = useSearchParams();
  const incomingUrl = params.get("url") || "";
  const incomingText = params.get("text") || "";
  const incomingTitle = params.get("title") || "";
  const initial = parseDetails({ text: incomingText, url: incomingUrl, title: incomingTitle });

  const [platform, setPlatform] = useState(initial.platform);
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl);
  const [pastedText, setPastedText] = useState(incomingText);
  const [productName, setProductName] = useState(initial.productName);
  const [saleTotal, setSaleTotal] = useState(initial.saleTotal);
  const [orderId, setOrderId] = useState(initial.orderId);
  const [buyer, setBuyer] = useState(initial.buyer);
  const [quantity, setQuantity] = useState(initial.quantity);
  const [size, setSize] = useState(initial.size);
  const [saleDate, setSaleDate] = useState(initial.saleDate);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [googleNeeded, setGoogleNeeded] = useState(false);

  const canSave = useMemo(
    () => sitesConfigured && trackedSites.includes(platform) && !!productName.trim() && Number(saleTotal) > 0 && !saving,
    [sitesConfigured, trackedSites, platform, productName, saleTotal, saving]
  );

  const autoFill = (text, explicitUrl = "", explicitTitle = "") => {
    const parsed = parseDetails({ text, url: explicitUrl || sourceUrl, title: explicitTitle });
    setPastedText(String(text || ""));
    if (parsed.platform && trackedSites.includes(parsed.platform)) setPlatform(parsed.platform);
    if (parsed.sourceUrl) setSourceUrl(parsed.sourceUrl);
    if (parsed.productName) setProductName(parsed.productName);
    if (parsed.saleTotal) setSaleTotal(parsed.saleTotal);
    if (parsed.orderId) setOrderId(parsed.orderId);
    if (parsed.buyer) setBuyer(parsed.buyer);
    if (parsed.quantity) setQuantity(parsed.quantity);
    if (parsed.size) setSize(parsed.size);
    if (parsed.saleDate) setSaleDate(parsed.saleDate);
    return parsed;
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = autoFill(text);
      const filled = Object.values(parsed).filter(Boolean).length;
      toast.success(`Auto-filled ${filled} sale details`);
    } catch {
      toast.error("Paste permission was not available", { description: "Press and hold in the box below and choose Paste. Art Flow will auto-fill as soon as you paste." });
    }
  };

  const connectGoogleSheets = async () => {
    try {
      const result = await artflowAuthClient.linkSocial({
        provider: "google",
        callbackURL: `${window.location.origin}/send-sale`,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        additionalParams: {
          access_type: "offline",
          include_granted_scopes: "true",
          prompt: "consent",
        },
      });
      if (result?.error) throw new Error(result.error.message || "Could not connect Google");
      if (result?.data?.url) window.location.assign(result.data.url);
    } catch (error) {
      toast.error("Could not connect Google Sheets", { description: error?.message });
    }
  };

  const save = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setSaved(false);
    setGoogleNeeded(false);
    const payload = {
      platform,
      source_url: sourceUrl,
      pasted_text: pastedText,
      product_name: productName,
      sale_total: Number(saleTotal),
      order_id: orderId,
      buyer,
      quantity: Number(quantity) || 1,
      size,
      sale_date: saleDate,
    };

    try {
      let data = {};
      if (user?.auth_backend === "neon") {
        const response = await fetch("/api/mobile-sale", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const err = new Error(data.error || "Could not send sale");
          err.code = data.code;
          throw err;
        }
      } else {
        // Temporary compatibility path while remaining accounts migrate from Base44.
        const response = await base44.functions.invoke("mobileOrderCapture", payload);
        data = response?.data || {};
        if (data?.error) throw new Error(data.error);
        await base44.functions.invoke("importFromSheets", { mode: "orders", sheetName: "Orders" }).catch(() => null);
      }

      window.dispatchEvent(new CustomEvent("artflow:data-synced", { detail: { source: "mobile_sale_capture" } }));
      setSaved(true);
      toast.success(data.message || "Sale sent to Art Flow");
    } catch (error) {
      if (["GOOGLE_NOT_LINKED", "GOOGLE_RECONNECT"].includes(error?.code)) setGoogleNeeded(true);
      toast.error("Could not send sale", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-heading text-2xl">Send Sale to Art Flow</h1>
          <p className="text-sm text-muted-foreground">Auto-fill from copied Vinted or Depop details</p>
        </div>
      </div>

      <section className="rounded-3xl p-5 border border-[hsl(var(--border))] bg-card">
        <div className="flex gap-3 items-start mb-4">
          <div className="w-10 h-10 rounded-2xl pastel-lavender flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4" /> Auto-populate sale details</p>
            <p className="text-sm text-muted-foreground mt-1">Copy the order details from Vinted or Depop. Art Flow looks for the platform, item, total, quantity, date, order number, buyer, and link automatically.</p>
          </div>
        </div>
        <button onClick={pasteFromClipboard} type="button" className="w-full h-12 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2">
          <ClipboardPaste className="w-4 h-4" /> Paste & Auto-Fill
        </button>
      </section>

      <form onSubmit={save} className="space-y-4">
        <section className="rounded-3xl p-5 border border-[hsl(var(--border))] bg-card space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Platform</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="form-input mt-1">
              <option value="">Auto-detect / choose</option>
              {trackedSites.map((site) => <option key={site} value={site}>{site}</option>)}
            </select>
          </div>

          {!sitesConfigured && (
            <div className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
              Choose the marketplaces you sell on in Account before sending a sale.
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Product name</label>
            <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Auto-filled product" className="form-input mt-1" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Sale total</label>
              <input inputMode="decimal" value={saleTotal} onChange={(e) => setSaleTotal(e.target.value)} placeholder="Auto-filled" className="form-input mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Quantity</label>
              <input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="form-input mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Size</label>
              <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="5x7" className="form-input mt-1" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Sale date</label>
            <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="form-input mt-1" />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Order number</label>
            <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Auto-filled when included" className="form-input mt-1" />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Buyer</label>
            <input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Auto-filled when included" className="form-input mt-1" />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Order link</label>
            <input value={sourceUrl} onChange={(e) => { const value = e.target.value; setSourceUrl(value); if (!platform) setPlatform(detectPlatform(value)); }} placeholder="Auto-filled link" className="form-input mt-1" />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Copied order details</label>
            <textarea
              value={pastedText}
              onChange={(e) => autoFill(e.target.value)}
              rows={5}
              placeholder="Paste the Vinted or Depop order details here — the fields above will fill automatically"
              className="form-input mt-1 min-h-32 resize-y"
            />
          </div>
        </section>

        {googleNeeded && (
          <section className="rounded-3xl p-4 border border-[hsl(var(--border))] bg-card">
            <p className="text-sm font-semibold">Google Sheets permission needed</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Connect the Google account that owns your ArtFlow Creative Tracker. Art Flow only requests spreadsheet access for this sync.
            </p>
            <button
              type="button"
              onClick={connectGoogleSheets}
              className="w-full h-12 rounded-2xl bg-muted text-foreground font-semibold"
            >
              Connect Google Sheets
            </button>
          </section>
        )}

        <button disabled={!canSave} className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {saved ? <CheckCircle2 className="w-5 h-5" /> : <Send className="w-5 h-5" />}
          {saving ? "Sending to spreadsheet…" : saved ? "Saved to Art Flow" : "Send Sale to Art Flow"}
        </button>
      </form>

      <p className="text-xs text-muted-foreground text-center px-4">
        Art Flow writes the sale to your Orders spreadsheet first, then syncs the spreadsheet into the app.
      </p>
    </div>
  );
}
