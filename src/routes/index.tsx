import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet, CalendarDays, CarFront, Plane, ChartNoAxesCombined, Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrar — Órion" },
      { name: "description", content: "Órion, seu assistente pessoal para organizar sua vida e suas finanças." },
      { property: "og:title", content: "Entrar — Órion" },
      { property: "og:description", content: "Controle de contas e cartões via Open Finance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const features = [{icon:Wallet,title:"Finanças"},{icon:CalendarDays,title:"Agenda"},{icon:CarFront,title:"Veículos"},{icon:Plane,title:"Viagens"},{icon:ChartNoAxesCombined,title:"Planejamento"}];

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/painel" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) toast.success("Conta criada! Confira seu e-mail para confirmar o cadastro.");
      }
    } catch (err) {
      toast.error((err as Error).message === "Invalid login credentials" ? "E-mail ou senha incorretos." : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("Não foi possível entrar com o Google.");
  }

  return (
    <div className="orion-auth">
      <section className="orion-auth-story" aria-label="Apresentação do Órion">
        <div><div className="mb-12"><Logo tone="light" size="lg"/></div><h1 className="orion-auth-title">Órion, seu assistente pessoal.<br/><span className="orion-auth-highlight">Tome melhores decisões sobre seu dinheiro.</span></h1><p className="orion-auth-description">Conheça seus gastos, sua rotina e seus compromissos. Planeje seu patrimônio e seus objetivos, tudo em um só lugar.</p></div>
        <div className="orion-auth-globe" aria-hidden="true"><svg viewBox="0 0 900 400" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="og" cx="45%" cy="32%" r="68%"><stop stopColor="#345b6e"/><stop offset=".6" stopColor="#143447"/><stop offset="1" stopColor="#091b2b"/></radialGradient><clipPath id="oc"><circle cx="450" cy="465" r="345"/></clipPath></defs><circle cx="450" cy="465" r="345" fill="url(#og)" stroke="#B99555" strokeWidth="2"/><g clipPath="url(#oc)" fill="none" stroke="#8fa8b6" strokeWidth="1" opacity=".4"><ellipse cx="450" cy="465" rx="135" ry="345"/><ellipse cx="450" cy="465" rx="260" ry="345"/><path d="M105 335Q450 235 795 335M105 240Q450 115 795 240M105 400H795"/></g><g clipPath="url(#oc)" fill="#b2a07a" opacity=".76"><path d="M280 170 330 145 380 165 406 195 390 220 421 245 401 275 375 263 367 295 347 300 335 272 307 265 296 228 265 221 251 188Z"/><path d="M413 270 452 253 492 279 513 315 508 345 483 377 481 402 463 430 450 403 452 365 434 344Z"/><path d="M525 165 576 144 635 157 680 185 704 220 674 235 650 216 610 226 585 207 553 218 532 194Z"/></g><g fill="none" stroke="#B99555" strokeWidth="1.5" opacity=".8"><path d="M80 290Q320 20 620 270"/><path d="M160 340Q470 40 800 295"/><path d="M270 328Q570 70 780 228"/></g><g fill="#E7E1D5" stroke="#B99555"><circle cx="80" cy="290" r="4"/><circle cx="620" cy="270" r="4"/><circle cx="160" cy="340" r="4"/><circle cx="800" cy="295" r="4"/></g></svg></div>
        <div className="orion-auth-features">{features.map(f=><div key={f.title} className="orion-auth-feature"><f.icon aria-hidden="true"/><span>{f.title}</span></div>)}</div>
      </section>
      <section className="orion-auth-panel" aria-label="Acesso à conta"><div className="orion-auth-form"><div className="mb-9 flex flex-col items-center"><Logo size="lg"/><p className="mt-5 text-center text-sm text-muted-foreground">Sua vida e suas finanças, com mais clareza.</p></div><h2 className="text-center text-3xl font-semibold">{mode==="login"?"Acesse sua conta":"Crie sua conta"}</h2><p className="mt-2 text-center text-sm text-muted-foreground">{mode==="login"?"Continue com segurança.":"Comece a organizar seus objetivos."}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">{mode==="signup"&&<div className="space-y-2"><Label htmlFor="name">Nome</Label><Input id="name" className="h-11" value={name} onChange={e=>setName(e.target.value)} required autoComplete="name" placeholder="Seu nome"/></div>}<div className="space-y-2"><Label htmlFor="email">E-mail</Label><div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="email" type="email" autoComplete="email" className="h-11 pl-10" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="Seu e-mail"/></div></div><div className="space-y-2"><Label htmlFor="pw">Senha</Label><div className="relative"><Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="pw" type={show?"text":"password"} autoComplete={mode==="login"?"current-password":"new-password"} minLength={6} className="h-11 px-10" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Sua senha"/><button type="button" onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={show?"Ocultar senha":"Mostrar senha"}>{show?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</button></div></div><Button type="submit" className="orion-action h-11 w-full" disabled={loading}>{mode==="login"?"Entrar":"Criar conta"}<ArrowRight/></Button></form><div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border"/>ou<div className="h-px flex-1 bg-border"/></div><Button variant="outline" className="h-11 w-full bg-white" onClick={google}><GoogleIcon/> Continuar com Google</Button><p className="mt-8 text-center text-sm text-muted-foreground">{mode==="login"?"Não tem uma conta? ":"Já tem uma conta? "}<button type="button" className="font-semibold text-[#906f37]" onClick={()=>setMode(mode==="login"?"signup":"login")}>{mode==="login"?"Criar conta":"Entrar"}</button></p></div></section>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-4">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
