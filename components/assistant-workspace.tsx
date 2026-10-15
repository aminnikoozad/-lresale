"use client";
import { useRouter } from "next/navigation";
import { PendingSubmitButton } from "./pending-submit-button";
import { CustomerSupport } from "./customer-support";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  Mic,
  MicOff,
  Send,
  ImagePlus,
  X,
  Volume2,
  VolumeX,
  ArrowUpRight,
  Settings2,
  Trash2,
  ShoppingBag,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "./cart-store";
import { AssistantMark } from "./assistant-mark";
import {
  sanitizeOperation,
  type AssistantMessage,
  type AssistantOperation,
  type AssistantProduct,
  type AssistantResult,
} from "@/lib/assistant-contract";
import { createCollectionRequest } from "@/app/account/actions";

type VoiceConnection = {
  pc: RTCPeerConnection;
  stream: MediaStream;
  audio: HTMLAudioElement;
  channel: RTCDataChannel;
  timer?: ReturnType<typeof setTimeout>;
};
const money = (v: number, fr: boolean) =>
  new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(v / 100);
export function AssistantWorkspace() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const cart = useCart();
  const [mode, setMode] = useState<"chat" | "voice">("chat");
  const voiceAttempt = useRef(0);
  const [fr, setFr] = useState(false),
    [messages, setMessages] = useState<AssistantMessage[]>([]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [image, setImage] = useState<string | null>(null),
    [voice, setVoice] = useState(false),
    [connecting, setConnecting] = useState(false),
    [muted, setMuted] = useState(false),
    [settings, setSettings] = useState(false),
    [memory, setMemory] = useState(true),
    [prefs, setPrefs] = useState<Record<string, string>>({}),
    [identity, setIdentity] = useState<string | null>(null),
    [alerts, setAlerts] = useState<
      {
        id: string;
        query: Record<string, string>;
        products: AssistantProduct[];
      }[]
    >([]);
  const history = useRef(messages),
    bag = useRef(cart.items),
    voiceRef = useRef<VoiceConnection | null>(null),
    busyRef = useRef(false),
    file = useRef<HTMLInputElement>(null),
    end = useRef<HTMLDivElement>(null),
    identityRef = useRef<string | null>(null);
  const t = (en: string, french: string) => (fr ? french : en);
  useEffect(() => {
    history.current = messages;
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);
  useEffect(() => {
    bag.current = cart.items;
  }, [cart.items]);
  const stopVoice = useCallback(() => {
    voiceAttempt.current += 1;
    const v = voiceRef.current;
    voiceRef.current = null;
    if (v) {
      clearTimeout(v.timer);
      v.channel.close();
      v.pc.close();
      v.stream.getTracks().forEach((track) => track.stop());
      v.audio.pause();
      v.audio.srcObject = null;
      voiceRef.current = null;
    }
    setVoice(false);
    setConnecting(false);
  }, []);
  useEffect(() => () => stopVoice(), [stopVoice]);
  useEffect(() => {
    let active = true;
    const restore = (id: string | null) => {
      if (!active) return;
      stopVoice();
      identityRef.current = id;
      setIdentity(id);
      setPrefs({});
      setMemory(true);
      setMessages([]);
      setAlerts([]);
      history.current = [];
      try {
        const saved = sessionStorage.getItem(
          `rewear-assistant:${id || "guest"}`,
        );
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed))
            setMessages(
              parsed
                .filter(
                  (m) =>
                    m &&
                    typeof m.id === "string" &&
                    ["user", "assistant"].includes(m.role) &&
                    typeof m.text === "string",
                )
                .slice(-40),
            );
        }
      } catch {}
      if (id)
        void supabase
          .from("assistant_preferences")
          .select("preferences,enabled")
          .eq("user_id", id)
          .maybeSingle()
          .then(({ data }) => {
            if (active && identityRef.current === id && data) {
              setPrefs(data.preferences || {});
              setMemory(data.enabled);
            }
          });
    };
    void supabase.auth.getUser().then(({ data }) => {
      setFr(new URLSearchParams(location.search).get("lang") === "fr");
      restore(data.user?.id || null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT")
        restore(session?.user.id || null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, stopVoice]);
  useEffect(() => {
    try {
      if (messages.length)
        sessionStorage.setItem(
          `rewear-assistant:${identity || "guest"}`,
          JSON.stringify(messages.slice(-40)),
        );
    } catch {}
  }, [messages, identity]);
  useEffect(() => {
    if (!identity) return;
    let active = true;
    void (async () => {
      const [w, c] = await Promise.all([
        supabase
          .from("assistant_watches")
          .select("id,query")
          .eq("user_id", identity)
          .eq("active", true),
        supabase.rpc("catalog_items_v3"),
      ]);
      if (!active) return;
      const inventory = c.data || [];
      setAlerts(
        (w.data || []).map((watch) => ({
          id: watch.id,
          query: watch.query,
          products: inventory
            .filter((p: Record<string, unknown>) => {
              const q = watch.query;
              return (
                (!q.category || q.category === p.category) &&
                (!q.size ||
                  q.size.toLowerCase() === String(p.size).toLowerCase()) &&
                (!q.color ||
                  q.color.toLowerCase() === String(p.color).toLowerCase()) &&
                (!q.brand ||
                  q.brand.toLowerCase() === String(p.brand).toLowerCase()) &&
                (!q.max_price_cents ||
                  Number(p.price_cents) <= Number(q.max_price_cents)) &&
                (!q.query ||
                  `${p.name} ${p.subcategory}`
                    .toLowerCase()
                    .includes(q.query.toLowerCase()))
              );
            })
            .slice(0, 4)
            .map((p: Record<string, unknown>) => ({
              id: String(p.item_id),
              name: String(p.name),
              brand: String(p.brand),
              priceCents: Number(p.price_cents),
              photoUrl: String(p.photo_url),
              size: p.size as string | null,
              condition: p.item_condition as string | null,
              category: String(p.category),
            })),
        })),
      );
    })();
    return () => {
      active = false;
    };
  }, [identity, supabase]);
  async function invoke(body: Record<string, unknown>) {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || data?.error)
      throw new Error(
        t(
          "Smart Shopping is temporarily unavailable. You can still enter the website.",
          "L’achat intelligent est temporairement indisponible. Vous pouvez toujours accéder au site.",
        ),
      );
    return data;
  }
  async function accept(result: AssistantResult, requester: string | null) {
    if (identityRef.current !== requester) return;
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: result.reply,
        result,
      },
    ]);
    if (
      memory &&
      identity &&
      result.preferences &&
      Object.keys(result.preferences).length
    ) {
      const next = { ...prefs, ...result.preferences };
      setPrefs(next);
      await supabase.from("assistant_preferences").upsert({
        user_id: identity,
        preferences: next,
        enabled: true,
        updated_at: new Date().toISOString(),
      });
    }
  }
  async function send(value = text) {
    if (busyRef.current || (!value.trim() && !image)) return;
    if (voiceRef.current?.channel.readyState === "open" && !image) {
      const channel = voiceRef.current.channel;
      channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: value.trim() }],
          },
        }),
      );
      channel.send(JSON.stringify({ type: "response.create" }));
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", text: value.trim() },
      ]);
      setText("");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    const requester = identityRef.current;
    const attachment = image;
    setImage(null);
    setText("");
    const next: AssistantMessage[] = [
      ...history.current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text:
          value.trim() ||
          t("Find something like this.", "Trouvez un article similaire."),
      },
    ];
    history.current = next;
    setMessages(next);
    try {
      const result = await invoke({
        messages: next,
        language: fr ? "fr" : "en",
        image: attachment,
        bag: bag.current.map((p) => ({ id: p.id, name: p.name })),
        visible_items: history.current
          .flatMap((m) => m.result?.products || [])
          .slice(-8),
      });
      await accept(result, requester);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function startVoice() {
    if (connecting || voiceRef.current) return;
    setMode("voice");
    const attempt = ++voiceAttempt.current;
    setConnecting(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (attempt !== voiceAttempt.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const pc = new RTCPeerConnection();
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.muted = muted;
      const channel = pc.createDataChannel("oai-events");
      const connection: VoiceConnection = { pc, audio, stream, channel };
      voiceRef.current = connection;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        void audio
          .play()
          .catch(() =>
            setError(
              t(
                "Tap the sound button to enable audio.",
                "Touchez le bouton du son pour activer l’audio.",
              ),
            ),
          );
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(pc.connectionState))
          stopVoice();
      };
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      channel.onmessage = (event) => {
        void (async () => {
          if (voiceRef.current !== connection) return;
          const e = JSON.parse(event.data);
          if (
            e.type ===
              "conversation.item.input_audio_transcription.completed" &&
            e.transcript
          ) {
            setMessages((m) => [
              ...m,
              {
                id: e.item_id || crypto.randomUUID(),
                role: "user",
                text: e.transcript,
              },
            ]);
          }
          if (
            e.type === "response.output_audio_transcript.done" &&
            e.transcript
          ) {
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                text: e.transcript,
              },
            ]);
          }
          if (e.type === "response.function_call_arguments.done") {
            try {
              const requester = identityRef.current;
              const args = JSON.parse(e.arguments);
              const result = await invoke({
                request: String(args.request || ""),
                messages: history.current.slice(-12),
                bag: bag.current.map((p) => ({ id: p.id, name: p.name })),
                visible_items: history.current
                  .flatMap((m) => m.result?.products || [])
                  .slice(-8),
                language: fr ? "fr" : "en",
              });
              if (voiceRef.current !== connection) return;
              await accept(result, requester);
              if (channel.readyState === "open") {
                channel.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: e.call_id,
                      output: JSON.stringify(result),
                    },
                  }),
                );
                channel.send(JSON.stringify({ type: "response.create" }));
              }
            } catch {
              if (channel.readyState === "open") {
                channel.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: e.call_id,
                      output: JSON.stringify({
                        error:
                          "Store request failed. Do not claim success; ask the customer to retry.",
                      }),
                    },
                  }),
                );
                channel.send(JSON.stringify({ type: "response.create" }));
              }
            }
          }
          if (e.type === "error")
            setError(
              t(
                "Voice had a problem. You can continue typing.",
                "Un problème vocal est survenu. Vous pouvez écrire.",
              ),
            );
        })().catch(() =>
          setError(t("Please try again.", "Veuillez réessayer.")),
        );
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const data = await invoke({
        mode: "voice",
        sdp: offer.sdp,
        language: fr ? "fr" : "en",
      });
      if (voiceRef.current !== connection) return;
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      setVoice(true);
      setConnecting(false);
      connection.timer = setTimeout(() => {
        stopVoice();
        setError(
          t(
            "Voice paused after 10 minutes. Start again whenever you like.",
            "La voix est en pause après 10 minutes. Vous pouvez la relancer.",
          ),
        );
      }, 600000);
      channel.onopen = () => {
        channel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Continue this conversation in ${fr ? "French" : "English"}. Recent context: ${JSON.stringify(history.current.slice(-10).map((m) => ({ role: m.role, text: m.text })))}`,
                },
              ],
            },
          }),
        );
      };
    } catch {
      stopVoice();
      setError(
        t(
          "Voice could not start. Check microphone permission, or use text chat.",
          "La voix n’a pas démarré. Vérifiez le micro ou utilisez le clavardage.",
        ),
      );
    }
  }
  async function execute(op: AssistantOperation) {
    const allowed=sanitizeOperation(op);
    if(!allowed)throw new Error("This action is not available in Smart Shopping.");
    op=allowed;
    setError("");
    if (op.name === "add_to_bag") {
      const products = history.current.flatMap((m) => m.result?.products || []);
      const product = products.find((p) => p.id === op.fields.item_id);
      if (!product)
        throw new Error(
          t(
            "Find this item again to check availability.",
            "Recherchez cet article pour vérifier sa disponibilité.",
          ),
        );
      cart.add(product);
      return;
    }
    if (op.name === "remove_from_bag") {
      cart.remove(op.fields.item_id);
      return;
    }
    if (op.name === "checkout") {
      if (Object.keys(op.fields).length) {
        const response = await fetch("/api/assistant/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(op),
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || "Review the delivery details.");
        }
      }
      stopVoice();
      router.push(
        `/checkout?${new URLSearchParams({ items: bag.current.map((p) => p.id).join(",") })}`,
      );
      return;
    }
    const response = await fetch("/api/assistant/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(op),
    });
    const data = await response.json();
    if (data.login) {
      router.push("/login?next=%2Fassistant");
      return;
    }
    if (data.verify) {
      router.push("/verify-phone");
      return;
    }
    if (!response.ok) throw new Error(data.error);
  }
  async function watch(query: Record<string, string>) {
    if (!identity) {
      router.push("/login?next=%2Fassistant");
      return;
    }
    const clean: Record<string, string> = {};
    for (const key of [
      "query",
      "category",
      "size",
      "color",
      "brand",
      "max_price_cents",
    ]) {
      if (typeof query[key] === "string") clean[key] = query[key].slice(0, 200);
    }
    const { error } = await supabase
      .from("assistant_watches")
      .insert({ user_id: identity, query: clean });
    if (error)
      setError(
        t(
          "Notification could not be saved.",
          "Impossible d’enregistrer l’alerte.",
        ),
      );
    else
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: t(
            "Stock notification enabled in your account. You can turn it off in settings.",
            "L’alerte de disponibilité est activée dans votre compte. Vous pouvez la désactiver dans les réglages.",
          ),
        },
      ]);
  }
  async function upload(file: File) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 1_800_000
    ) {
      setError(
        t(
          "Choose a JPG, PNG or WebP under 1.8 MB.",
          "Choisissez une image JPG, PNG ou WebP de moins de 1,8 Mo.",
        ),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }
  async function clearMemory() {
    setPrefs({});
    if (identity)
      await supabase
        .from("assistant_preferences")
        .upsert({ user_id: identity, preferences: {}, enabled: false });
    setMemory(false);
  }
  return (
    <main className="assistant-shell" lang={fr ? "fr" : "en"}>
      <header className="assistant-header">
        <Link href="/" className="brand">
          REWEAR.
        </Link>
        <div>
          <button
            onClick={() => {
              stopVoice();
              setFr(!fr);
            }}
          >
            {fr ? "EN" : "FR"}
          </button>
          <button
            onClick={() => setSettings(!settings)}
            aria-label={t("Settings", "Réglages")}
            aria-expanded={settings}
          >
            <Settings2 size={20} />
          </button>
          <Link href="/shop">
            {t("Shop", "Boutique")}
            <ArrowUpRight size={16} />
          </Link>
          <Link href="/cart" aria-label={t("Shopping bag", "Sac")}>
            <ShoppingBag size={19} />
            <span>{cart.items.length}</span>
          </Link>
        </div>
      </header>
      {settings && (
        <aside className="assistant-settings">
          <h2>{t("Your assistant", "Votre assistant")}</h2>
          <p>
            {t(
              "Shopping preferences help personalize your experience. Conversations stay in this browser tab; account preferences are saved when signed in.",
              "Vos préférences d’achat personnalisent l’expérience. Les conversations restent dans cet onglet; les préférences sont enregistrées dans votre compte connecté.",
            )}
          </p>
          <label>
            <input
              type="checkbox"
              checked={memory}
              onChange={async (e) => {
                setMemory(e.target.checked);
                if (identity)
                  await supabase.from("assistant_preferences").upsert({
                    user_id: identity,
                    preferences: prefs,
                    enabled: e.target.checked,
                  });
              }}
            />
            {t(
              "Remember shopping preferences",
              "Mémoriser mes préférences d’achat",
            )}
          </label>
          <dl>
            {Object.entries(prefs).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <button onClick={() => void clearMemory()}>
            <Trash2 size={16} />
            {t(
              "Clear memory & stop remembering",
              "Effacer et désactiver la mémoire",
            )}
          </button>
          <button
            onClick={() => {
              setMessages([]);
              history.current = [];
              sessionStorage.removeItem(
                `rewear-assistant:${identity || "guest"}`,
              );
            }}
          >
            {t("Clear conversation", "Effacer la conversation")}
          </button>
          <h3>
            {t(
              "Stock notifications · in your account",
              "Alertes de disponibilité · dans votre compte",
            )}
          </h3>
          {alerts.map((a) => (
            <div key={a.id}>
              {Object.values(a.query).join(" · ")}
              <button
                onClick={async () => {
                  await supabase
                    .from("assistant_watches")
                    .update({ active: false })
                    .eq("id", a.id);
                  setAlerts((x) => x.filter((w) => w.id !== a.id));
                }}
              >
                {t("Turn off", "Désactiver")}
              </button>
            </div>
          ))}
          <CustomerSupport userId={identity} fr={fr} />
          <Link href="/privacy">{t("Privacy", "Confidentialité")}</Link>
        </aside>
      )}
      <div
        className="assistant-mode-tabs"
        role="tablist"
        aria-label={t("Shopping mode", "Mode d’achat")}
      >
        <button
          id="assistant-chat-tab"
          role="tab"
          aria-selected={mode === "chat"}
          aria-controls="assistant-panel"
          onClick={() => {
            stopVoice();
            setMode("chat");
          }}
        >
          <MessageCircle size={18} />
          {t("Chat", "Clavardage")}
        </button>
        <button
          id="assistant-voice-tab"
          role="tab"
          aria-selected={mode === "voice"}
          aria-controls="assistant-panel"
          onClick={() => setMode("voice")}
        >
          <Mic size={18} />
          {t("Live voice", "Voix en direct")}
        </button>
      </div>
      <section
        id="assistant-panel"
        role="tabpanel"
        aria-labelledby={
          mode === "voice" ? "assistant-voice-tab" : "assistant-chat-tab"
        }
        className="assistant-conversation"
        aria-label={t("Conversation", "Conversation")}
      >
        {mode === "voice" && (
          <section className="assistant-live-panel">
            <AssistantMark active={voice || connecting} />
            <h2>
              {t("Live voice conversation", "Conversation vocale en direct")}
            </h2>
            <p>
              {voice
                ? t(
                    "I’m listening. Speak naturally; you can interrupt me.",
                    "Je vous écoute. Parlez naturellement; vous pouvez m’interrompre.",
                  )
                : t(
                    "Start talking. Products and requests appear here while we speak.",
                    "Parlons ensemble. Les articles et les demandes s’affichent ici pendant notre conversation.",
                  )}
            </p>
            <button
              disabled={connecting}
              onClick={() => (voice ? stopVoice() : void startVoice())}
            >
              {voice ? <MicOff size={19} /> : <Mic size={19} />}
              {connecting
                ? t("Connecting…", "Connexion…")
                : voice
                  ? t("End live conversation", "Terminer la conversation")
                  : t("Start live voice", "Démarrer la voix en direct")}
            </button>
          </section>
        )}
        {!messages.length && mode === "chat" && (
          <div className="assistant-welcome">
            <AssistantMark active={voice} />
            <p>YOUR REWEAR</p>
            <h1>
              {t(
                "What are you looking for?",
                "Qu’est-ce qui vous ferait plaisir?",
              )}
            </h1>
            <span>
              {t(
                "A piece you’ll love. A little help selling. Just ask.",
                "Une trouvaille à aimer. Un coup de main pour vendre. Demandez.",
              )}
            </span>
            <div className="assistant-starters">
              {[
                t("Women’s T-shirts, size S", "T-shirts pour femme, taille S"),
                t(
                  "Help me arrange a pickup",
                  "Aidez-moi à organiser un ramassage",
                ),
                t(
                  "What’s happening with my items?",
                  "Où en sont mes articles?",
                ),
              ].map((s) => (
                <button key={s} onClick={() => void send(s)} disabled={busy}>
                  {s}
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
        {alerts
          .filter((a) => a.products.length)
          .map((a) => (
            <section key={a.id} className="assistant-stock">
              <h2>
                {t(
                  "Something you wanted is here",
                  "Un article recherché est disponible",
                )}
              </h2>
              <ProductCards products={a.products} fr={fr} add={cart.add} />
            </section>
          ))}
        <div aria-live="polite" aria-relevant="additions text">
          {messages.map((m) => (
            <article
              className={`assistant-message message-${m.role}`}
              key={m.id}
            >
              {m.role === "assistant" && <AssistantMark active={busy} />}
              <div className="assistant-message-content">
                <p>{m.text}</p>
                {m.result?.products?.length ? (
                  <ProductCards
                    products={m.result.products}
                    fr={fr}
                    add={cart.add}
                  />
                ) : null}
                {m.result?.operation && (
                  <OperationReview
                    key={`${m.id}:${m.result.operation.name}`}
                    operation={m.result.operation}
                    fr={fr}
                    execute={execute}
                  />
                )}
                {m.result?.alertQuery && (
                  <NotificationConsent
                    fr={fr}
                    onAccept={() => watch(m.result!.alertQuery!)}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
        {busy && (
          <div className="assistant-thinking" role="status">
            <AssistantMark active />
            {t("Finding your next step…", "Je regarde ça pour vous…")}
          </div>
        )}
        <div ref={end} />
      </section>
      <div className="assistant-composer-wrap">
        {error && (
          <>
            <p role="alert" className="assistant-error">
              {error}
            </p>
            <div className="assistant-error-actions">
              <button
                onClick={() => {
                  setError("");
                  if (mode === "voice") void startVoice();
                  else {
                    const previous = [...history.current]
                      .reverse()
                      .find((m) => m.role === "user");
                    if (previous) void send(previous.text);
                  }
                }}
              >
                {t("Try again", "Réessayer")}
              </button>
              <Link href="/shop">
                {t("Enter website", "Entrer sur le site")}
              </Link>
            </div>
          </>
        )}
        {voice && (
          <div className="assistant-voice-status">
            <span />
            {t(
              "Listening · you can interrupt",
              "À l’écoute · vous pouvez m’interrompre",
            )}
            <button
              onClick={() => {
                const next = !muted;
                setMuted(next);
                if (voiceRef.current) voiceRef.current.audio.muted = next;
              }}
              aria-label={t(
                "Toggle spoken replies",
                "Activer ou couper les réponses vocales",
              )}
            >
              {muted ? <VolumeX /> : <Volume2 />}
            </button>
            <button onClick={stopVoice}>
              {t("End voice", "Arrêter la voix")}
            </button>
          </div>
        )}
        {image && (
          <div className="assistant-attachment">
            {t("Reference photo attached", "Photo de référence jointe")}
            <button
              onClick={() => setImage(null)}
              aria-label={t("Remove photo", "Retirer la photo")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <form
          className="assistant-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <button
            type="button"
            onClick={() => file.current?.click()}
            aria-label={t(
              "Attach a reference photo",
              "Joindre une photo de référence",
            )}
          >
            <ImagePlus />
          </button>
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) void upload(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={3000}
            placeholder={t(
              "Tell me what you have in mind…",
              "Dites-moi ce que vous cherchez…",
            )}
            aria-label={t("Your message", "Votre message")}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            className={voice ? "voice-active" : ""}
            disabled={connecting}
            onClick={() => (voice ? stopVoice() : void startVoice())}
            aria-label={
              voice
                ? t("Stop voice conversation", "Arrêter la conversation vocale")
                : t(
                    "Start voice conversation",
                    "Démarrer la conversation vocale",
                  )
            }
          >
            {voice ? <MicOff /> : <Mic />}
          </button>
          <button
            type="submit"
            className="assistant-send"
            disabled={busy || (!text.trim() && !image)}
            aria-label={t("Send", "Envoyer")}
          >
            <Send size={20} />
          </button>
        </form>
        <p className="assistant-disclosure">
          {t(
            "AI assistant · Review details before confirming. Preferences personalize your experience.",
            "Assistant IA · Vérifiez les détails avant de confirmer. Vos préférences personnalisent l’expérience.",
          )}{" "}
          <Link href="/account">{t("Account", "Compte")}</Link>
        </p>
      </div>
    </main>
  );
}
function ProductCards({
  products,
  fr,
  add,
}: {
  products: AssistantProduct[];
  fr: boolean;
  add: (p: AssistantProduct) => void;
}) {
  return (
    <div className="assistant-products">
      {products.map((p, i) => (
        <article key={p.id}>
          <Link href={`/item/${p.id}`}>
            <div className="assistant-product-photo">
              <Image
                src={p.photoUrl}
                alt={p.name}
                fill
                sizes="(max-width:600px) 42vw, 220px"
              />
              <span>{i + 1}</span>
            </div>
            <div>
              <b>{money(p.priceCents, fr)}</b>
              <span>
                {p.brand} · {p.name}
              </span>
              <small>
                {[p.size, p.color, p.condition].filter(Boolean).join(" · ")}
              </small>
            </div>
          </Link>
          <button onClick={() => add(p)}>
            {fr ? "Ajouter au sac" : "Add to bag"}
          </button>
        </article>
      ))}
    </div>
  );
}
function NotificationConsent({
  fr,
  onAccept,
}: {
  fr: boolean;
  onAccept: () => Promise<void>;
}) {
  const [done, setDone] = useState(false),
    [pending, setPending] = useState(false);
  return (
    <button
      className="assistant-consent"
      disabled={done || pending}
      onClick={async () => {
        setPending(true);
        try {
          await onAccept();
          setDone(true);
        } finally {
          setPending(false);
        }
      }}
    >
      {done
        ? fr
          ? "Alerte demandée"
          : "Alert requested"
        : fr
          ? "Oui, m’avertir dans mon compte"
          : "Yes, notify me in my account"}
    </button>
  );
}
function OperationReview({
  operation,
  fr,
  execute,
}: {
  operation: AssistantOperation;
  fr: boolean;
  execute: (op: AssistantOperation) => Promise<void>;
}) {
  const op = sanitizeOperation(operation);
  const [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if(!op)return null;
  return (
    <section className="assistant-review">
      <h3>{fr ? "Vérifiez avant de confirmer" : "Review before confirming"}</h3>
      <p>{op.summary}</p>
      <dl>
        {Object.entries(op.fields)
          .filter(([k]) => !k.endsWith("_id"))
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k.replaceAll("_", " ")}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {op.name === "create_pickup" ? (
        <form action={createCollectionRequest}>
          {Object.entries(op.fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label>
            <input
              type="checkbox"
              name="condition_confirmed"
              value="accepted"
              required
            />
            {fr
              ? "Je confirme l’état et l’admissibilité des articles."
              : "I confirm the condition and eligibility of my items."}
          </label>
          <label>
            <input
              type="checkbox"
              name="policy_accepted"
              value="accepted"
              required
            />
            {fr
              ? "J’accepte les conditions de vente."
              : "I accept the seller terms."}{" "}
            <Link href="/seller-terms" target="_blank">
              {fr ? "Lire" : "Read"}
            </Link>
          </label>
          <label>
            <input
              type="checkbox"
              name="pickup_policy_accepted"
              value="accepted"
              required
            />
            {fr
              ? "J’accepte la politique de ramassage."
              : "I accept the pickup policy."}
            <Link href="/pickup-policy" target="_blank">
              {fr ? "Lire" : "Read"}
            </Link>
          </label>
          <label>
            <input
              type="checkbox"
              name="service_fee_accepted"
              value="accepted"
              required
            />
            {fr
              ? "J’accepte les frais de service indiqués dans la politique."
              : "I accept the service fees shown in the policy."}
          </label>
          <label>
            <input
              type="checkbox"
              name="pickup_fee_accepted"
              value="accepted"
              required
            />
            {fr
              ? "J’accepte les frais de ramassage applicables indiqués dans la politique."
              : "I accept the applicable pickup fees shown in the policy."}
          </label>
          <PendingSubmitButton
            pendingLabel={fr ? "Enregistrement…" : "Submitting…"}
          >
            {fr
              ? "Confirmer et enregistrer le ramassage"
              : "Confirm & submit pickup"}
          </PendingSubmitButton>
        </form>
      ) : (
        <button
          disabled={busy || done}
          onClick={async () => {
            if (busy || done) return;
            setBusy(true);
            setError("");
            try {
              await execute(op);
              setDone(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {done
            ? fr
              ? "Terminé"
              : "Done"
            : busy
              ? fr
                ? "En cours…"
                : "Working…"
              : op.name === "checkout"
                ? fr
                  ? "Continuer au paiement"
                  : "Continue to checkout"
                : fr
                  ? "Confirmer"
                  : "Confirm"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
