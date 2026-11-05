import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  useAdminLogin, useAdminLogout, useCreateOrder, useCreateProduct, useDeleteProduct,
  useGetAdminSession, useGetAdminSummary, useGetOrderStatus, useGetProduct,
  useListAdminOrders, useListProducts, useRequestProductUploadUrl, useSubmitContactMessage,
  useUpdateProduct, getGetAdminSessionQueryKey, getGetAdminSummaryQueryKey,
  getGetOrderStatusQueryKey, getListAdminOrdersQueryKey,
} from '@workspace/api-client-react';
import type { AdminOrder, Product, ProductInput, ProductUpdate } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, Clock3, GraduationCap, LockKeyhole,
  Menu, MessageCircle, PackageOpen, Pencil, Search, ShieldCheck,
  Smartphone, Trash2, Upload, X, LogOut, Plus, AlertTriangle,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import type { ReactNode, FormEvent } from 'react';

const queryClient = new QueryClient();
const money = (amount: number) => `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`;
const niceDate = (date: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
const paymentLabel = (method: string) => method === 'mixx_by_yas' ? 'Mixx by Yas' : 'Flooz';
const statusLabel = (status: string) => status === 'paid' ? 'Payée' : status === 'failed' ? 'Échouée' : 'En attente';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Une erreur est survenue. Réessayez.';

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="site-header sticky top-0 z-30">
    <div className="site-wrap flex h-[74px] items-center justify-between gap-5">
      <Link href="/" className="flex items-center gap-3" data-testid="link-home-brand">
        <span className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground"><BookOpen size={19}/></span>
        <span className="leading-tight"><span className="block font-bold tracking-[-.04em] text-foreground">Boutique Digitale</span><span className="mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Togo · savoir en poche</span></span>
      </Link>
      <nav className="hidden items-center gap-8 text-sm font-semibold md:flex" aria-label="Navigation principale">
        <Link className="nav-link" href="/catalogue" data-testid="link-catalogue">Catalogue</Link>
        <Link className="nav-link" href="/contact" data-testid="link-contact">Contact</Link>
        <Link className="nav-link" href="/cgv" data-testid="link-cgv">Conditions</Link>
      </nav>
      <Link href="/catalogue" className="btn-primary hidden !px-5 !py-3 text-sm md:inline-flex" data-testid="link-shop">Explorer <ArrowRight size={16}/></Link>
      <button className="grid size-10 place-items-center rounded-full border border-border md:hidden" aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setMenuOpen(!menuOpen)} data-testid="button-mobile-menu">{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button>
    </div>
    {menuOpen && <nav className="site-wrap flex flex-col gap-4 border-t border-border py-5 text-sm font-semibold md:hidden">
      <Link className="nav-link" href="/catalogue" onClick={() => setMenuOpen(false)} data-testid="mobile-link-catalogue">Catalogue</Link>
      <Link className="nav-link" href="/contact" onClick={() => setMenuOpen(false)} data-testid="mobile-link-contact">Contact</Link>
      <Link className="nav-link" href="/cgv" onClick={() => setMenuOpen(false)} data-testid="mobile-link-cgv">Conditions générales</Link>
    </nav>}
  </header>;
}

function Footer() {
  return <footer className="mt-20 border-t border-border bg-[#eee9dd]">
    <div className="site-wrap grid gap-9 py-10 md:grid-cols-[1fr_auto] md:items-end">
      <div><p className="serif text-2xl font-extrabold text-foreground">Le savoir, à portée de main.</p><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Des ressources numériques pensées pour apprendre à votre rythme, partout au Togo.</p></div>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold"><Link href="/catalogue" className="nav-link" data-testid="footer-catalogue">Catalogue</Link><Link href="/contact" className="nav-link" data-testid="footer-contact">Nous écrire</Link><Link href="/cgv" className="nav-link" data-testid="footer-cgv">CGV</Link><Link href="/admin" className="nav-link" data-testid="footer-admin">Administration</Link></div>
      <p className="mono text-[10px] uppercase tracking-[.12em] text-muted-foreground md:col-span-2">© Boutique Digitale Togo · Prix affichés en FCFA</p>
    </div>
  </footer>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <div className="min-h-[100dvh] bg-background text-foreground"><Header/><main className="min-h-[55vh]"><ErrorBoundary resetKey={location}>{children}</ErrorBoundary></main><Footer/></div>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="mono mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-primary"><span className="inline-block h-px w-6 bg-accent"/>{children}</div>;
}

function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return <div className="max-w-3xl"><Eyebrow>{eyebrow}</Eyebrow><h1 className="serif text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-5xl">{title}</h1>{subtitle && <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{subtitle}</p>}</div>;
}

function ProductArtwork({ product, compact = false }: { product: Product; compact?: boolean }) {
  return product.coverUrl
    ? <img src={product.coverUrl} alt={`Couverture de ${product.title}`} loading="lazy" className={`w-full rounded-2xl object-cover ${compact ? 'h-36' : 'h-[235px]'}`} data-testid={`image-cover-${product.id}`}/>
    : <div className={`product-art ${compact ? '!min-h-0 h-36' : ''} flex flex-col justify-between p-5`} data-testid={`art-cover-${product.id}`}>
      <div className="product-art__stripe"/>
      <span className="mono relative z-[1] text-[10px] font-bold uppercase tracking-[.14em] text-primary">{product.type === 'ebook' ? 'Lecture numérique' : 'Formation en ligne'}</span>
      <div className="relative z-[1] max-w-[85%]"><p className={`serif font-extrabold leading-[1.05] text-primary ${compact ? 'text-lg' : 'text-2xl'}`}>{product.title}</p><span className="mono mt-2 block text-[9px] uppercase tracking-[.16em] text-primary/70">BDT · ressource pratique</span></div>
    </div>;
}

function ProductCard({ product }: { product: Product }) {
  return <Link href={`/produit/${product.slug}`} className="card-hover group block rounded-2xl border border-border bg-card p-3" data-testid={`card-product-${product.id}`}>
    <ProductArtwork product={product}/>
    <div className="px-2 pb-2 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2"><span className="mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">{product.category}</span><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-secondary-foreground">{product.type === 'ebook' ? 'Ebook' : 'Formation'}</span></div>
      <h3 className="serif line-clamp-2 min-h-[48px] text-xl font-bold leading-tight group-hover:text-primary">{product.title}</h3>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3"><span className="font-bold">{money(product.priceFcfa)}</span><span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"><ArrowRight size={15}/></span></div>
    </div>
  </Link>;
}

function ProductsGrid({ products, loading, error, onRetry }: { products?: Product[]; loading: boolean; error?: unknown; onRetry?: () => void }) {
  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2].map((i) => <div key={i} className="rounded-2xl border border-border p-3"><div className="skeleton h-[235px] rounded-xl"/><div className="skeleton mt-4 h-4 w-1/3 rounded"/><div className="skeleton mt-3 h-6 rounded"/><div className="skeleton mt-5 h-8 rounded"/></div>)}</div>;
  if (error) return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center"><AlertTriangle className="mx-auto text-destructive" size={25}/><p className="mt-3 font-bold">Le catalogue ne répond pas.</p><p className="mt-1 text-sm text-muted-foreground">{errorMessage(error)}</p><button className="btn-secondary mt-5" onClick={onRetry} data-testid="button-retry-products">Réessayer</button></div>;
  if (!products?.length) return <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center"><PackageOpen className="mx-auto text-muted-foreground" size={30}/><p className="mt-4 font-bold">Aucun contenu pour le moment</p><p className="mt-1 text-sm text-muted-foreground">Revenez bientôt, de nouvelles ressources arrivent.</p></div>;
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div>;
}

function HomePage() {
  const products = useListProducts();
  const featured = useMemo(() => products.data?.slice(0, 3), [products.data]);
  return <Shell><section className="site-wrap grid gap-10 pb-16 pt-10 md:grid-cols-[1.02fr_.98fr] md:items-center md:pb-24 md:pt-16">
    <div className="reveal">
      <Eyebrow>Une boutique faite pour vous</Eyebrow>
      <h1 className="serif max-w-[660px] text-[clamp(3rem,8vw,6.4rem)] font-extrabold leading-[.93] tracking-[-.065em]">Apprenez.<br/><span className="text-primary">À votre rythme.</span></h1>
      <p className="mt-6 max-w-[500px] text-lg leading-8 text-muted-foreground">Ebooks et formations pratiques, accessibles sur votre téléphone. Le bon savoir, au bon moment, partout au Togo.</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link href="/catalogue" className="btn-primary" data-testid="hero-catalogue">Voir le catalogue <ArrowRight size={17}/></Link><Link href="/contact" className="btn-secondary" data-testid="hero-contact">Une question ?</Link></div>
      <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-semibold text-muted-foreground"><span className="flex items-center gap-2"><ShieldCheck size={15} className="text-primary"/>Paiement mobile sécurisé</span><span className="flex items-center gap-2"><Smartphone size={15} className="text-primary"/>Pensé pour le téléphone</span></div>
    </div>
    <div className="relative min-h-[350px] overflow-hidden rounded-[2rem] bg-primary p-7 text-[#fbf5e7] md:min-h-[480px] md:p-10">
      <div className="absolute -right-16 -top-20 size-[310px] rounded-full border border-[#f6e9c3]/30 md:size-[410px]"/><div className="absolute -right-4 -top-8 size-[250px] rounded-full border border-[#f6e9c3]/20 md:size-[330px]"/>
      <div className="absolute bottom-0 left-0 right-0 top-0 opacity-[.09]" style={{backgroundImage:'radial-gradient(#f7eac6 1px, transparent 1px)',backgroundSize:'16px 16px'}}/>
      <div className="relative z-[1] flex h-full min-h-[300px] flex-col justify-between md:min-h-[400px]">
        <div className="flex items-start justify-between"><span className="mono text-[10px] uppercase tracking-[.16em] text-[#f5db9b]">Le prochain chapitre</span><span className="grid size-11 place-items-center rounded-full border border-white/30"><BookOpen size={19}/></span></div>
        <div className="max-w-md"><p className="serif text-5xl font-extrabold leading-[.96] tracking-[-.05em] md:text-7xl">Commence<br/>par une idée.</p><p className="mt-5 max-w-sm text-sm leading-6 text-white/75">Des contenus utiles, simples à parcourir et prêts à vous accompagner au quotidien.</p></div>
        <div className="flex items-end justify-between"><span className="mono text-[10px] uppercase tracking-[.14em] text-white/55">Togo · Afrique de l’Ouest</span><span className="serif text-5xl font-bold text-[#f2d284]">01</span></div>
      </div>
    </div>
  </section>
  <section className="bg-[#eee9dd] py-14 md:py-20"><div className="site-wrap">
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><Eyebrow>Choisir son format</Eyebrow><h2 className="serif text-3xl font-extrabold tracking-tight md:text-4xl">Un format qui vous ressemble.</h2></div><Link className="nav-link flex items-center gap-2 text-sm font-bold" href="/catalogue" data-testid="link-all-products">Tout le catalogue <ArrowRight size={16}/></Link></div>
    <div className="grid gap-4 md:grid-cols-[1fr_1.35fr]">
      <Link href="/catalogue?type=ebook" className="group flex min-h-[190px] flex-col justify-between rounded-2xl bg-[#dfe8dc] p-6" data-testid="card-format-ebook"><BookOpen className="text-primary" size={24}/><div className="flex items-end justify-between"><div><p className="mono text-[10px] uppercase tracking-[.12em] text-primary">Lire & retenir</p><h3 className="serif mt-1 text-2xl font-extrabold">Ebooks pratiques</h3></div><ArrowRight className="text-primary transition-transform group-hover:translate-x-1" size={19}/></div></Link>
      <Link href="/catalogue?type=formation" className="group flex min-h-[190px] flex-col justify-between rounded-2xl bg-[#f2d99c] p-6" data-testid="card-format-training"><GraduationCap className="text-primary" size={27}/><div className="flex items-end justify-between"><div><p className="mono text-[10px] uppercase tracking-[.12em] text-primary">Apprendre en faisant</p><h3 className="serif mt-1 text-2xl font-extrabold">Formations guidées</h3></div><ArrowRight className="text-primary transition-transform group-hover:translate-x-1" size={19}/></div></Link>
    </div>
  </div></section>
  <section className="site-wrap py-14 md:py-20"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Eyebrow>À découvrir</Eyebrow><h2 className="serif text-3xl font-extrabold tracking-tight md:text-4xl">Des ressources pour avancer.</h2></div><Link className="nav-link flex items-center gap-2 text-sm font-bold" href="/catalogue" data-testid="link-explore-catalogue">Explorer le catalogue <ArrowRight size={16}/></Link></div><ProductsGrid products={featured} loading={products.isLoading} error={products.error} onRetry={() => products.refetch()}/></section>
  <section className="site-wrap pb-10"><div className="grid gap-6 rounded-[2rem] bg-primary px-6 py-8 text-primary-foreground md:grid-cols-[1fr_auto] md:items-center md:px-10 md:py-10"><div><Eyebrow>Simple et rassurant</Eyebrow><h2 className="serif max-w-2xl text-3xl font-extrabold leading-tight md:text-4xl">Votre téléphone suffit. Votre curiosité aussi.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/70">Choisissez une ressource, renseignez vos coordonnées et payez avec Mixx by Yas ou Flooz.</p></div><Link href="/catalogue" className="btn-secondary w-fit !bg-[#efd58e]" data-testid="cta-catalogue">Trouver ma prochaine lecture <ArrowRight size={16}/></Link></div></section>
  </Shell>;
}

function CataloguePage() {
  const [params] = useLocation();
  const searchParams = new URLSearchParams(params.split('?')[1] || '');
  const initialType = searchParams.get('type') || '';
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const products = useListProducts({ search: search.trim() || undefined, category: category || undefined });
  const categories = useMemo(() => Array.from(new Set(products.data?.map((p) => p.category) || [])).sort((a,b) => a.localeCompare(b, 'fr')), [products.data]);
  const filtered = useMemo(() => products.data?.filter((p) => !initialType || p.type === initialType), [products.data, initialType]);
  return <Shell><section className="site-wrap py-10 md:py-16">
    <PageTitle eyebrow="Catalogue" title="Trouvez votre prochain déclic." subtitle="Parcourez des ressources numériques utiles, disponibles immédiatement après l’achat."/>
    <div className="mt-8 grid gap-3 md:grid-cols-[1fr_250px]">
      <label className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18}/><input className="field !pl-11" type="search" placeholder="Rechercher un sujet ou un titre" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-catalogue-search"/></label>
      <select className="field" aria-label="Filtrer par catégorie" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="select-category"><option value="">Toutes les catégories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    </div>
    {initialType && <p className="mt-3 text-xs text-muted-foreground">Format : {initialType === 'ebook' ? 'Ebooks' : 'Formations'} <Link href="/catalogue" className="ml-2 font-bold text-primary underline" data-testid="link-clear-type">Effacer</Link></p>}
    <div className="mt-8"><ProductsGrid products={filtered} loading={products.isLoading} error={products.error} onRetry={() => products.refetch()}/></div>
  </section></Shell>;
}

function ProductPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const product = useGetProduct(slug);
  if (product.isLoading) return <Shell><div className="site-wrap grid gap-8 py-12 md:grid-cols-2"><div className="skeleton h-80 rounded-3xl"/><div className="space-y-4"><div className="skeleton h-4 w-1/4 rounded"/><div className="skeleton h-12 rounded"/><div className="skeleton h-28 rounded"/></div></div></Shell>;
  if (product.error || !product.data) return <Shell><div className="site-wrap py-20 text-center"><AlertTriangle className="mx-auto text-destructive" size={26}/><h1 className="serif mt-4 text-3xl font-bold">Cette ressource est introuvable.</h1><p className="mt-2 text-sm text-muted-foreground">{product.error ? errorMessage(product.error) : 'Elle a peut-être été déplacée.'}</p><Link href="/catalogue" className="btn-primary mt-6" data-testid="link-back-catalogue">Retour au catalogue</Link></div></Shell>;
  const item = product.data;
  return <Shell><section className="site-wrap py-8 md:py-12">
    <button className="mb-7 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary" onClick={() => setLocation('/catalogue')} data-testid="button-back-catalogue"><ArrowLeft size={16}/> Retour au catalogue</button>
    <div className="grid gap-8 md:grid-cols-[.92fr_1.08fr] md:gap-14">
      <div className="rounded-[2rem] bg-[#eee9dd] p-4 md:p-7"><ProductArtwork product={item}/><div className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary"><ShieldCheck size={15}/> Achat sécurisé · Paiement mobile</div></div>
      <div className="py-2"><Eyebrow>{item.category} · {item.type === 'ebook' ? 'Ebook' : 'Formation'}</Eyebrow><h1 className="serif text-4xl font-extrabold leading-[1.02] tracking-tight md:text-6xl">{item.title}</h1><p className="mt-5 text-base leading-7 text-muted-foreground">{item.description}</p>
        <div className="mt-8 flex items-end justify-between border-y border-border py-5"><div><p className="mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Prix unique</p><p className="serif mt-1 text-3xl font-extrabold">{money(item.priceFcfa)}</p></div><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Smartphone size={16}/> Conçu pour mobile</div></div>
        <button className="btn-primary mt-7 w-full sm:w-auto" onClick={() => setLocation(`/commande/${item.slug}`)} data-testid="button-buy-product">Acheter cette ressource <ArrowRight size={17}/></button>
        <div className="mt-7 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2"><span className="flex items-center gap-2"><Check size={16} className="text-primary"/>Prix affiché en FCFA</span><span className="flex items-center gap-2"><Check size={16} className="text-primary"/>Mixx by Yas ou Flooz</span></div>
      </div>
    </div>
  </section></Shell>;
}

function CheckoutPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const product = useGetProduct(slug);
  const createOrder = useCreateOrder();
  const [paymentMethod, setPaymentMethod] = useState<'mixx_by_yas' | 'flooz'>('mixx_by_yas');
  const [checkout, setCheckout] = useState<{ orderId: string; checkoutUrl: string } | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!product.data) return;
    createOrder.mutate({ data: {
      productId: product.data.id, customerName: String(form.get('name') || '').trim(),
      email: String(form.get('email') || '').trim(), phone: String(form.get('phone') || '').trim(),
      paymentMethod,
    } }, { onSuccess: (result) => setCheckout({ orderId: result.orderId, checkoutUrl: result.checkoutUrl }) });
  };
  if (product.isLoading) return <Shell><div className="site-wrap max-w-4xl py-12"><div className="skeleton h-10 w-1/2 rounded"/><div className="skeleton mt-8 h-96 rounded-3xl"/></div></Shell>;
  if (product.error || !product.data) return <Shell><div className="site-wrap py-20 text-center"><h1 className="serif text-3xl font-bold">Impossible de préparer la commande.</h1><p className="mt-2 text-sm text-muted-foreground">{errorMessage(product.error)}</p><Link href="/catalogue" className="btn-primary mt-6" data-testid="checkout-back">Revenir au catalogue</Link></div></Shell>;
  const item = product.data;
  return <Shell><section className="site-wrap py-10 md:py-14">
    <PageTitle eyebrow="Commande sécurisée" title="Quelques informations, puis c’est à vous." subtitle="Utilisez une adresse e-mail et un numéro auxquels vous avez accès."/>
    {checkout ? <div className="mt-9 max-w-2xl rounded-3xl border border-primary/20 bg-[#e7eee3] p-6 md:p-9">
      <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground"><Check size={23}/></span><h2 className="serif mt-5 text-3xl font-extrabold">Commande créée.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Votre demande est enregistrée. Finalisez le paiement auprès de {paymentLabel(paymentMethod)}, puis consultez le statut réel de votre commande.</p>
      <div className="mono mt-5 rounded-xl bg-background/70 p-4 text-xs"><span className="text-muted-foreground">Référence</span><span className="ml-3 font-bold">{checkout.orderId}</span></div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><a className="btn-primary" href={checkout.checkoutUrl} target="_blank" rel="noreferrer" data-testid="link-payment-checkout">Continuer vers le paiement <ArrowRight size={16}/></a><Link href={`/succes/${checkout.orderId}`} className="btn-secondary" data-testid="link-check-order">Suivre ma commande</Link></div>
    </div> : <div className="mt-9 grid gap-8 lg:grid-cols-[1fr_360px]">
      <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-5 md:p-8">
        <h2 className="serif text-2xl font-extrabold">Vos coordonnées</h2><p className="mt-1 text-sm text-muted-foreground">Elles servent à retrouver votre achat et vous transmettre les informations utiles.</p>
        <div className="mt-6 grid gap-4"><label className="text-sm font-bold">Nom complet<input required minLength={2} name="name" autoComplete="name" className="field mt-2" placeholder="Votre nom" data-testid="input-customer-name"/></label><label className="text-sm font-bold">Adresse e-mail<input required type="email" name="email" autoComplete="email" className="field mt-2" placeholder="vous@exemple.com" data-testid="input-customer-email"/></label><label className="text-sm font-bold">Téléphone<input required minLength={8} maxLength={24} type="tel" name="phone" autoComplete="tel" className="field mt-2" placeholder="+228 90 00 00 00" data-testid="input-customer-phone"/></label></div>
        <h3 className="mt-8 text-sm font-bold">Choisissez votre moyen de paiement</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(['mixx_by_yas','flooz'] as const).map((method) => <button type="button" key={method} onClick={() => setPaymentMethod(method)} className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${paymentMethod === method ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted'}`} data-testid={`button-payment-${method}`}><span className="grid size-10 place-items-center rounded-full bg-secondary text-primary"><Smartphone size={18}/></span><span className="flex-1"><b className="block text-sm">{paymentLabel(method)}</b><small className="text-muted-foreground">Paiement mobile</small></span><span className={`size-4 rounded-full border ${paymentMethod === method ? 'border-[5px] border-primary' : 'border-muted-foreground/50'}`}/></button>)}
        </div>
        {createOrder.error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{errorMessage(createOrder.error)}</p>}
        <button className="btn-primary mt-6 w-full disabled:opacity-60" type="submit" disabled={createOrder.isPending} data-testid="button-place-order">{createOrder.isPending ? 'Création en cours…' : 'Confirmer la commande'}{!createOrder.isPending && <ArrowRight size={17}/>}</button>
        <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground"><LockKeyhole size={13}/>Vos informations restent confidentielles.</p>
      </form>
      <aside className="h-fit rounded-3xl bg-[#eee9dd] p-5 md:p-6"><Eyebrow>Récapitulatif</Eyebrow><div className="flex gap-4"><div className="w-24 shrink-0"><ProductArtwork product={item} compact/></div><div><p className="serif text-lg font-bold leading-tight">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.type === 'ebook' ? 'Ebook' : 'Formation'} · {item.category}</p></div></div><div className="mt-6 flex justify-between border-t border-border pt-4 text-sm"><span className="text-muted-foreground">Total à payer</span><b>{money(item.priceFcfa)}</b></div><div className="mt-5 rounded-xl bg-background/70 p-3 text-xs leading-5 text-muted-foreground">Après confirmation, vous serez dirigé vers l’étape de paiement mobile. Le statut est toujours vérifié depuis notre système.</div></aside>
    </div>}
  </section></Shell>;
}

function OrderStatusPage() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const order = useGetOrderStatus(orderId, { query: { queryKey: getGetOrderStatusQueryKey(orderId), enabled: !!orderId, refetchInterval: (query) => query.state.data?.status === 'pending' ? 4000 : false } });
  if (order.isLoading) return <Shell><div className="site-wrap max-w-2xl py-20"><div className="skeleton mx-auto h-40 rounded-3xl"/></div></Shell>;
  if (order.error || !order.data) return <Shell><section className="site-wrap max-w-2xl py-16 text-center"><AlertTriangle className="mx-auto text-destructive" size={30}/><h1 className="serif mt-4 text-3xl font-extrabold">Statut indisponible</h1><p className="mt-2 text-sm text-muted-foreground">{errorMessage(order.error)}</p><button className="btn-secondary mt-5" onClick={() => order.refetch()} data-testid="button-refresh-order">Réessayer</button><div><Link href="/catalogue" className="mt-5 inline-block text-sm font-bold text-primary underline" data-testid="link-order-catalogue">Retour au catalogue</Link></div></section></Shell>;
  const details = order.data;
  const paid = details.status === 'paid';
  const failed = details.status === 'failed';
  return <Shell><section className="site-wrap max-w-3xl py-10 md:py-16">
    <div className={`rounded-[2rem] border p-6 md:p-10 ${paid ? 'border-primary/20 bg-[#e5eee1]' : failed ? 'border-destructive/20 bg-destructive/5' : 'border-[#e6cc8d] bg-[#f7edcf]'}`}>
      <span className={`grid size-14 place-items-center rounded-full ${paid ? 'bg-primary text-primary-foreground' : failed ? 'bg-destructive text-destructive-foreground' : 'bg-[#e8c35e] text-foreground'}`}>{paid ? <Check size={24}/> : failed ? <X size={24}/> : <Clock3 size={24}/>}</span>
      <Eyebrow>Suivi de commande · {details.orderId}</Eyebrow>
      <h1 className="serif text-4xl font-extrabold leading-tight">{paid ? 'Paiement confirmé.' : failed ? 'Le paiement n’a pas abouti.' : 'Paiement en cours de vérification.'}</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{paid ? 'Votre paiement a été confirmé. Votre commande est bien enregistrée.' : failed ? 'Le statut transmis par le service de paiement indique un échec. Vous pouvez réessayer depuis le catalogue.' : 'Nous vérifions votre paiement. Cette page se met à jour automatiquement, inutile de la recharger.'}</p>
      <div className="mt-7 grid gap-3 rounded-2xl bg-background/75 p-5 sm:grid-cols-2">
        <div><span className="mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">Ressource</span><p className="mt-1 font-bold" data-testid="text-order-product">{details.productTitle}</p></div>
        <div><span className="mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">Montant</span><p className="mt-1 font-bold" data-testid="text-order-amount">{money(details.amountFcfa)}</p></div>
        <div><span className="mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">Paiement</span><p className="mt-1 font-bold">{paymentLabel(details.paymentMethod)}</p></div>
        <div><span className="mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">Statut actuel</span><p className={`mt-1 font-bold ${paid ? 'text-primary' : failed ? 'text-destructive' : 'text-[#9a7014]'}`} data-testid="status-payment">{statusLabel(details.status)}</p></div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Créée le {niceDate(details.createdAt)}</p>
      <div className="mt-6 flex flex-wrap gap-3">{details.status === 'pending' && <button onClick={() => order.refetch()} className="btn-secondary" data-testid="button-refresh-order-status">Actualiser maintenant</button>}{failed && <Link href="/catalogue" className="btn-primary" data-testid="link-retry-order">Retour au catalogue <ArrowRight size={16}/></Link>}<Link href="/" className="btn-secondary" data-testid="link-status-home">Accueil</Link></div>
    </div>
  </section></Shell>;
}

function TermsPage() {
  return <Shell><section className="site-wrap max-w-4xl py-10 md:py-16"><PageTitle eyebrow="Informations légales" title="Conditions générales de vente" subtitle="Les règles essentielles de vos achats numériques sur Boutique Digitale Togo."/>
    <div className="mt-10 space-y-8">
      {[['01','Objet','La boutique propose à la vente des ressources numériques, notamment des ebooks et des formations. Les caractéristiques et le prix de chaque ressource sont présentés sur sa page produit.'],['02','Prix et paiement','Les prix sont indiqués en francs CFA (FCFA). Le paiement est proposé via Mixx by Yas ou Flooz. La commande est créée après validation du formulaire et son statut est confirmé par le système de paiement.'],['03','Accès aux contenus','Les contenus numériques sont destinés à un usage personnel. Les modalités de réception ou d’accès sont communiquées après confirmation du paiement. En cas de difficulté, contactez notre équipe avec votre référence de commande.'],['04','Données personnelles','Les coordonnées fournies sont utilisées pour traiter la commande et répondre aux demandes. Elles ne doivent être ni partagées ni utilisées à d’autres fins que la gestion de la boutique.'],['05','Assistance','Pour toute question concernant un achat, écrivez-nous depuis la page contact en indiquant votre référence de commande si vous en avez une.']].map(([num,title,body]) => <article key={num} className="grid gap-3 border-t border-border pt-6 sm:grid-cols-[64px_1fr]"><span className="mono text-xs font-bold text-accent">{num}</span><div><h2 className="serif text-2xl font-extrabold">{title}</h2><p className="mt-2 leading-7 text-muted-foreground">{body}</p></div></article>)}
      <p className="border-t border-border pt-5 text-xs text-muted-foreground">Ces conditions s’appliquent aux achats effectués sur Boutique Digitale Togo. Pour toute précision, utilisez le formulaire de contact.</p>
    </div>
  </section></Shell>;
}

function ContactPage() {
  const contact = useSubmitContactMessage();
  const [sent, setSent] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    contact.mutate({ data: { name: String(form.get('name') || '').trim(), email: String(form.get('email') || '').trim(), message: String(form.get('message') || '').trim() } }, { onSuccess: () => setSent(true) });
  };
  return <Shell><section className="site-wrap grid gap-9 py-10 md:grid-cols-[.9fr_1.1fr] md:py-16">
    <div><PageTitle eyebrow="Nous sommes là" title="Une question ? Écrivons-nous." subtitle="Besoin d’aide pour une commande ou une ressource ? Envoyez-nous un message, nous vous répondrons dès que possible."/>
      <div className="mt-8 rounded-2xl bg-[#eee9dd] p-5"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><MessageCircle size={18}/></span><div><b className="text-sm">Une réponse humaine</b><p className="mt-1 text-sm leading-6 text-muted-foreground">Pour un achat, ajoutez votre numéro de commande afin de faciliter le suivi.</p></div></div></div>
    </div>
    <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-5 md:p-8">
      {sent ? <div className="py-12 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground"><Check size={25}/></span><h2 className="serif mt-5 text-3xl font-extrabold">Message envoyé.</h2><p className="mt-2 text-sm text-muted-foreground">Merci de nous avoir écrit. Votre message a bien été transmis.</p><button type="button" className="btn-secondary mt-6" onClick={() => {setSent(false); contact.reset();}} data-testid="button-send-another">Envoyer un autre message</button></div> : <>
        <h2 className="serif text-2xl font-extrabold">Votre message</h2><div className="mt-6 grid gap-4"><label className="text-sm font-bold">Nom<input className="field mt-2" name="name" minLength={2} required autoComplete="name" data-testid="input-contact-name"/></label><label className="text-sm font-bold">E-mail<input className="field mt-2" type="email" name="email" required autoComplete="email" data-testid="input-contact-email"/></label><label className="text-sm font-bold">Message<textarea className="field mt-2 min-h-36 resize-y" name="message" minLength={10} required placeholder="Comment pouvons-nous vous aider ?" data-testid="input-contact-message"/></label></div>
        {contact.error && <p className="mt-4 text-sm text-destructive" role="alert">{errorMessage(contact.error)}</p>}<button className="btn-primary mt-5 w-full disabled:opacity-60" disabled={contact.isPending} type="submit" data-testid="button-submit-contact">{contact.isPending ? 'Envoi en cours…' : 'Envoyer le message'} <ArrowRight size={16}/></button>
      </>}
    </form>
  </section></Shell>;
}

type ProductDraft = { title: string; type: 'ebook' | 'formation'; category: string; description: string; priceFcfa: string; file: File | null };

function AdminLogin({ onLogin }: { onLogin: (password: string) => void }) {
  const login = useAdminLogin({ request: { credentials: 'include' } });
  const [error, setError] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') || '');
    login.mutate({ data: { password } }, { onSuccess: (session) => session.authenticated ? onLogin(password) : setError('Accès refusé. Vérifiez le mot de passe.'), onError: (err) => setError(errorMessage(err)) });
  };
  return <Shell><section className="site-wrap max-w-xl py-12 md:py-20"><div className="rounded-3xl border border-border bg-card p-6 md:p-9"><span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground"><LockKeyhole size={20}/></span><Eyebrow>Accès réservé</Eyebrow><h1 className="serif text-4xl font-extrabold">Administration</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Connectez-vous pour gérer les ressources et consulter les commandes.</p><form onSubmit={submit} className="mt-7"><label className="text-sm font-bold">Mot de passe<input className="field mt-2" type="password" name="password" required autoComplete="current-password" data-testid="input-admin-password"/></label>{error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}<button className="btn-primary mt-5 w-full disabled:opacity-60" disabled={login.isPending} type="submit" data-testid="button-admin-login">{login.isPending ? 'Connexion…' : 'Ouvrir la session'} <ArrowRight size={16}/></button></form><p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={14}/>Session protégée par cookie serveur.</p></div></section></Shell>;
}

function ProductForm({ product, onClose, onSaved }: { product?: Product; onClose: () => void; onSaved: () => void }) {
  const requestUpload = useRequestProductUploadUrl({ request: { credentials: 'include' } });
  const create = useCreateProduct({ request: { credentials: 'include' } });
  const update = useUpdateProduct({ request: { credentials: 'include' } });
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const file = form.get('file') as File;
    const title = String(form.get('title') || '').trim();
    const type = String(form.get('type')) as 'ebook' | 'formation';
    const category = String(form.get('category') || '').trim();
    const description = String(form.get('description') || '').trim();
    const priceFcfa = Number(form.get('priceFcfa'));
    try {
      let uploaded: { uploadId: string; objectPath: string } | null = null;
      if (file && file.size > 0) {
        setUploading(true);
        const ticket = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type || 'application/octet-stream' } });
        const result = await fetch(ticket.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        if (!result.ok) throw new Error('Le fichier n’a pas pu être téléversé. Réessayez.');
        uploaded = { uploadId: ticket.uploadId, objectPath: ticket.objectPath };
        setUploading(false);
      }
      if (!product && !uploaded) throw new Error('Ajoutez un fichier numérique pour créer la ressource.');
      if (product) {
        const data: ProductUpdate = { title, type, category, description, priceFcfa };
        if (uploaded) { data.uploadId = uploaded.uploadId; data.coverUrl = `/api/storage${uploaded.objectPath}`; }
        await update.mutateAsync({ id: product.id, data });
      } else {
        const data: ProductInput = { title, type, category, description, priceFcfa, uploadId: uploaded!.uploadId, coverUrl: `/api/storage${uploaded!.objectPath}` };
        await create.mutateAsync({ data });
      }
      onSaved();
    } catch (err) { setError(errorMessage(err)); }
    finally { setUploading(false); }
  };
  const busy = uploading || requestUpload.isPending || create.isPending || update.isPending;
  return <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" role="presentation" onMouseDown={(e) => {if (e.target === e.currentTarget) onClose();}}>
    <form onSubmit={submit} className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-background p-5 shadow-xl sm:rounded-3xl sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><Eyebrow>Catalogue · administration</Eyebrow><h2 className="serif text-3xl font-extrabold">{product ? 'Modifier la ressource' : 'Ajouter une ressource'}</h2></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full border border-border" aria-label="Fermer" data-testid="button-close-product-form"><X size={18}/></button></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold sm:col-span-2">Titre<input required minLength={2} maxLength={160} name="title" defaultValue={product?.title} className="field mt-2" data-testid="input-product-title"/></label>
        <label className="text-sm font-bold">Type<select name="type" defaultValue={product?.type || 'ebook'} className="field mt-2" data-testid="select-product-type"><option value="ebook">Ebook</option><option value="formation">Formation</option></select></label>
        <label className="text-sm font-bold">Catégorie<input required minLength={2} maxLength={80} name="category" defaultValue={product?.category} className="field mt-2" placeholder="Ex. Entrepreneuriat" data-testid="input-product-category"/></label>
        <label className="text-sm font-bold">Prix (FCFA)<input required min={1} max={100000000} type="number" name="priceFcfa" defaultValue={product?.priceFcfa} className="field mt-2" data-testid="input-product-price"/></label>
        <label className="text-sm font-bold sm:col-span-2">Description<textarea required minLength={10} maxLength={5000} name="description" defaultValue={product?.description} className="field mt-2 min-h-28 resize-y" data-testid="input-product-description"/></label>
        <label className="cursor-pointer rounded-xl border border-dashed border-border bg-muted/50 p-4 text-sm sm:col-span-2"><span className="flex items-center gap-2 font-bold"><Upload size={17} className="text-primary"/>Fichier numérique {product && <span className="font-normal text-muted-foreground">(optionnel si aucun remplacement)</span>}</span><input className="mt-3 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-primary-foreground" type="file" name="file" data-testid="input-product-file"/><span className="mt-2 block text-xs text-muted-foreground">Le fichier sera téléversé de manière sécurisée avant l’enregistrement.</span></label>
      </div>
      {error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={onClose} data-testid="button-cancel-product">Annuler</button><button className="btn-primary disabled:opacity-60" disabled={busy} type="submit" data-testid="button-save-product">{busy ? 'Enregistrement…' : product ? 'Enregistrer les modifications' : 'Créer la ressource'}{!busy && <Check size={16}/>}</button></div>
    </form>
  </div>;
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const client = useQueryClient();
  const summary = useGetAdminSummary({ request: { credentials: 'include' } });
  const orders = useListAdminOrders({}, { request: { credentials: 'include' } });
  const products = useListProducts();
  const deleteProduct = useDeleteProduct({ request: { credentials: 'include' } });
  const logout = useAdminLogout({ request: { credentials: 'include' } });
  const [editing, setEditing] = useState<Product | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [orderStatus, setOrderStatus] = useState('');
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'paid' | 'failed'>('all');
  const filteredOrders = useMemo(() => orders.data?.filter((order) => orderFilter === 'all' || order.status === orderFilter), [orders.data, orderFilter]);
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['/api/products'] });
    void client.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
    void client.invalidateQueries({ queryKey: getListAdminOrdersQueryKey({}) });
    setFormOpen(false); setEditing(undefined);
  };
  const removeProduct = (product: Product) => {
    if (window.confirm(`Désactiver « ${product.title} » du catalogue ?`)) {
      deleteProduct.mutate({ id: product.id }, { onSuccess: invalidate, onError: (err) => setOrderStatus(errorMessage(err)) });
    }
  };
  const doLogout = () => logout.mutate(undefined, { onSuccess: () => { void client.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() }); onLogout(); } });
  return <Shell><section className="site-wrap py-8 md:py-12">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><Eyebrow>Espace sécurisé</Eyebrow><h1 className="serif text-4xl font-extrabold tracking-tight">Vue d’ensemble</h1><p className="mt-2 text-sm text-muted-foreground">Gérez les ressources et consultez l’activité des commandes.</p></div><button className="btn-secondary w-fit" onClick={doLogout} disabled={logout.isPending} data-testid="button-admin-logout"><LogOut size={16}/>{logout.isPending ? 'Déconnexion…' : 'Se déconnecter'}</button></div>
    {summary.isLoading ? <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[0,1,2,3,4].map((n)=><div key={n} className="skeleton h-28 rounded-2xl"/>)}</div> : summary.error ? <div className="mt-8 rounded-xl border border-destructive/20 p-5 text-sm text-destructive">Le résumé des ventes n’est pas disponible. {errorMessage(summary.error)} <button onClick={() => summary.refetch()} className="ml-2 underline" data-testid="button-retry-summary">Réessayer</button></div> : <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
      ['Commandes', summary.data?.totalOrders],['En attente', summary.data?.pendingOrders],['Payées', summary.data?.paidOrders],['Chiffre d’affaires', money(summary.data?.revenueFcfa || 0)],['Produits actifs', summary.data?.activeProducts],
    ].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-border bg-card p-4"><p className="mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">{label}</p><p className="serif mt-3 text-2xl font-extrabold" data-testid={`summary-${String(label).toLowerCase().replaceAll(' ','-')}`}>{value}</p></div>)}</div>}
    <div className="mt-10">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><Eyebrow>Catalogue</Eyebrow><h2 className="serif text-2xl font-extrabold">Ressources</h2></div><button onClick={() => {setEditing(undefined);setFormOpen(true);}} className="btn-primary w-fit" data-testid="button-add-product"><Plus size={16}/>Ajouter une ressource</button></div>
      {products.isLoading ? <div className="space-y-3">{[0,1].map((n)=><div className="skeleton h-20 rounded-xl" key={n}/>)}</div> : products.error ? <div className="rounded-xl border border-destructive/20 p-5 text-sm text-destructive">Catalogue indisponible : {errorMessage(products.error)} <button onClick={() => products.refetch()} className="ml-2 underline" data-testid="button-retry-admin-products">Réessayer</button></div> : !products.data?.length ? <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Aucune ressource visible dans le catalogue.</div> : <div className="overflow-hidden rounded-2xl border border-border bg-card">{products.data.map((product)=><div key={product.id} className="grid gap-3 border-b border-border p-4 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center" data-testid={`admin-product-${product.id}`}><div className="flex min-w-0 items-center gap-3"><div className="w-16 shrink-0"><ProductArtwork product={product} compact/></div><div className="min-w-0"><p className="truncate font-bold">{product.title}</p><p className="mt-1 text-xs text-muted-foreground">{product.category} · {product.type === 'ebook' ? 'Ebook' : 'Formation'} · {money(product.priceFcfa)} · {product.isActive ? 'Actif' : 'Inactif'}</p></div></div><div className="flex gap-2"><button className="grid size-10 place-items-center rounded-full border border-border hover:bg-muted" aria-label={`Modifier ${product.title}`} onClick={() => {setEditing(product);setFormOpen(true);}} data-testid={`button-edit-product-${product.id}`}><Pencil size={16}/></button><button className="grid size-10 place-items-center rounded-full border border-border text-destructive hover:bg-destructive/5" aria-label={`Désactiver ${product.title}`} onClick={() => removeProduct(product)} disabled={deleteProduct.isPending} data-testid={`button-delete-product-${product.id}`}><Trash2 size={16}/></button></div></div>)}</div>}
    </div>
    <div className="mt-11">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><Eyebrow>Suivi des ventes</Eyebrow><h2 className="serif text-2xl font-extrabold">Commandes</h2></div><select className="field max-w-[220px]" value={orderFilter} onChange={(e) => setOrderFilter(e.target.value as typeof orderFilter)} aria-label="Filtrer les commandes" data-testid="select-order-filter"><option value="all">Tous les statuts</option><option value="pending">En attente</option><option value="paid">Payées</option><option value="failed">Échouées</option></select></div>
      {orderStatus && <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{orderStatus}<button className="ml-3 underline" onClick={() => setOrderStatus('')} data-testid="button-dismiss-admin-error">Fermer</button></p>}
      {orders.isLoading ? <div className="space-y-3">{[0,1,2].map((n)=><div className="skeleton h-24 rounded-xl" key={n}/>)}</div> : orders.error ? <div className="rounded-xl border border-destructive/20 p-5 text-sm text-destructive">Commandes indisponibles : {errorMessage(orders.error)} <button onClick={() => orders.refetch()} className="ml-2 underline" data-testid="button-retry-orders">Réessayer</button></div> : !filteredOrders?.length ? <div className="rounded-2xl border border-dashed border-border bg-card p-9 text-center"><PackageOpen className="mx-auto text-muted-foreground" size={26}/><p className="mt-3 text-sm font-bold">Aucune commande pour ce filtre.</p></div> : <div className="space-y-3">{filteredOrders.map((order: AdminOrder)=><div key={order.orderId} className="grid gap-4 rounded-2xl border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto] md:items-center" data-testid={`admin-order-${order.orderId}`}><div><p className="font-bold">{order.customerName}</p><p className="mt-1 text-xs text-muted-foreground">{order.email} · {order.phone}</p><p className="mono mt-2 text-[10px] text-muted-foreground">{order.orderId}</p></div><div><p className="text-sm font-semibold">{order.productTitle}</p><p className="mt-1 text-xs text-muted-foreground">{paymentLabel(order.paymentMethod)} · {niceDate(order.createdAt)}</p></div><div className="flex items-center justify-between gap-4 md:block md:text-right"><div><p className="font-bold">{money(order.amountFcfa)}</p><span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold ${order.status === 'paid' ? 'bg-primary/10 text-primary' : order.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-[#f5e8bd] text-[#825e13]'}`}>{statusLabel(order.status)}</span></div></div></div>)}</div>}
    </div>
  </section>{formOpen && <ProductForm product={editing} onClose={() => {setFormOpen(false);setEditing(undefined);}} onSaved={invalidate}/>}</Shell>;
}

function AdminPage() {
  const session = useGetAdminSession({ request: { credentials: 'include' } });
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  if (session.isLoading && authenticated === null) return <Shell><section className="site-wrap max-w-xl py-20"><div className="skeleton h-60 rounded-3xl"/></section></Shell>;
  const isLoggedIn = authenticated ?? Boolean(session.data?.authenticated);
  return isLoggedIn ? <AdminDashboard onLogout={() => setAuthenticated(false)}/> : <AdminLogin onLogin={() => {setAuthenticated(true);void queryClient.invalidateQueries({queryKey:getGetAdminSessionQueryKey()});}}/>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={HomePage}/>
    <Route path="/catalogue" component={CataloguePage}/>
    <Route path="/produit/:slug" component={ProductPage}/>
    <Route path="/commande/:slug" component={CheckoutPage}/>
    <Route path="/succes/:orderId" component={OrderStatusPage}/>
    <Route path="/cgv" component={TermsPage}/>
    <Route path="/contact" component={ContactPage}/>
    <Route path="/admin" component={AdminPage}/>
    <Route component={NotFound}/>
  </Switch></RoutedErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Router/><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;
