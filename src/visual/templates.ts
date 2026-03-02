import { state, visual } from '../state';
import { generatePageHTML } from './export';

// ── Types ────────────────────────────────────────────────────────────

export interface PageTemplate {
  id: string;
  name: string;
  category: 'portfolio' | 'business' | 'creative' | 'landing' | 'restaurant' | 'personal' | 'report';
  emoji: string;
  description: string;
  html: string;
}

// ── Helper ───────────────────────────────────────────────────────────

function escapeHtmlTs(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Templates ────────────────────────────────────────────────────────

const portfolioTemplate: PageTemplate = {
  id: 'portfolio',
  name: 'Creative Portfolio',
  category: 'portfolio',
  emoji: '\u{1F3A8}',
  description: 'A dark, modern portfolio for creatives and designers',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>My Portfolio</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --color-primary: #6366f1;
  --color-bg: #0f172a;
  --color-text: #e2e8f0;
  --color-muted: #94a3b8;
  --font-heading: 'Plus Jakarta Sans', sans-serif;
  --font-body: 'DM Sans', sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); background: var(--color-bg); color: var(--color-text); line-height: 1.6; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; max-width: 1200px; margin: 0 auto; }
nav .logo { font-family: var(--font-heading); font-weight: 800; font-size: 20px; }
nav ul { list-style: none; display: flex; gap: 32px; }
nav a { font-size: 14px; color: var(--color-muted); transition: color .2s; }
nav a:hover { color: var(--color-text); }
.hero { max-width: 1200px; margin: 0 auto; padding: 100px 40px 80px; }
.hero h1 { font-family: var(--font-heading); font-size: clamp(2.5rem,6vw,4.5rem); font-weight: 800; line-height: 1.1; margin-bottom: 20px; }
.hero h1 span { color: var(--color-primary); }
.hero p { color: var(--color-muted); font-size: 18px; max-width: 540px; margin-bottom: 36px; }
.hero-cta { display: inline-flex; align-items: center; gap: 8px; background: var(--color-primary); color: #fff; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; transition: opacity .2s; }
.hero-cta:hover { opacity: .9; }
.work { max-width: 1200px; margin: 0 auto; padding: 40px 40px 80px; }
.work h2 { font-family: var(--font-heading); font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: var(--color-muted); margin-bottom: 32px; }
.work-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.work-card { background: #1e293b; border-radius: 12px; overflow: hidden; transition: transform .2s; }
.work-card:hover { transform: translateY(-4px); }
.work-card .thumb { aspect-ratio: 16/10; background: linear-gradient(135deg, #334155, #1e293b); display: flex; align-items: center; justify-content: center; font-size: 32px; }
.work-card .info { padding: 16px; }
.work-card h3 { font-family: var(--font-heading); font-size: 16px; font-weight: 600; margin-bottom: 4px; }
.work-card p { font-size: 13px; color: var(--color-muted); }
footer { max-width: 1200px; margin: 0 auto; padding: 40px; border-top: 1px solid #1e293b; display: flex; justify-content: space-between; font-size: 13px; color: var(--color-muted); }
@media (max-width: 768px) {
  nav { padding: 16px 20px; }
  nav ul { gap: 16px; }
  .hero { padding: 60px 20px 40px; }
  .work { padding: 20px 20px 40px; }
  .work-grid { grid-template-columns: 1fr; }
  footer { padding: 20px; flex-direction: column; gap: 8px; }
}
</style>
</head>
<body>
<nav>
  <div class="logo">Studio</div>
  <ul>
    <li><a href="#work">Work</a></li>
    <li><a href="#about">About</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
</nav>
<section class="hero">
  <h1>I design digital<br>experiences that <span>matter</span></h1>
  <p>Product designer and creative director based in New York, working with startups and brands to build memorable products.</p>
  <a href="#work" class="hero-cta">View Selected Work</a>
</section>
<section class="work" id="work">
  <h2>Selected Projects</h2>
  <div class="work-grid">
    <div class="work-card">
      <div class="thumb" style="background:linear-gradient(135deg,#6366f1,#a855f7)"></div>
      <div class="info"><h3>Fintech Dashboard</h3><p>Product Design / 2024</p></div>
    </div>
    <div class="work-card">
      <div class="thumb" style="background:linear-gradient(135deg,#ec4899,#f97316)"></div>
      <div class="info"><h3>E-Commerce Rebrand</h3><p>Brand Identity / 2024</p></div>
    </div>
    <div class="work-card">
      <div class="thumb" style="background:linear-gradient(135deg,#14b8a6,#3b82f6)"></div>
      <div class="info"><h3>Health Tracking App</h3><p>Mobile Design / 2023</p></div>
    </div>
  </div>
</section>
<footer>
  <span>2024 Studio. All rights reserved.</span>
  <span>hello@studio.design</span>
</footer>
</body>
</html>`,
};

const businessTemplate: PageTemplate = {
  id: 'business',
  name: 'Professional Agency',
  category: 'business',
  emoji: '\u{1F3E2}',
  description: 'A clean, professional site for agencies and businesses',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agency</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
  --color-primary: #2563eb;
  --color-bg: #ffffff;
  --color-text: #1e293b;
  --color-muted: #64748b;
  --font-heading: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); background: var(--color-bg); color: var(--color-text); line-height: 1.6; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
nav { display: flex; justify-content: space-between; align-items: center; padding: 18px 40px; max-width: 1200px; margin: 0 auto; }
nav .logo { font-weight: 800; font-size: 22px; letter-spacing: -0.5px; }
nav ul { list-style: none; display: flex; gap: 32px; align-items: center; }
nav a { font-size: 14px; font-weight: 500; color: var(--color-muted); transition: color .2s; }
nav a:hover { color: var(--color-text); }
.nav-cta { background: var(--color-primary); color: #fff !important; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; }
.hero { max-width: 1200px; margin: 0 auto; padding: 80px 40px; text-align: center; }
.hero .badge { display: inline-block; background: #eff6ff; color: var(--color-primary); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
.hero h1 { font-size: clamp(2rem,5vw,3.5rem); font-weight: 800; line-height: 1.15; max-width: 720px; margin: 0 auto 20px; letter-spacing: -1px; }
.hero p { font-size: 18px; color: var(--color-muted); max-width: 560px; margin: 0 auto 36px; }
.hero-btns { display: flex; gap: 12px; justify-content: center; }
.btn-primary { background: var(--color-primary); color: #fff; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; }
.btn-secondary { background: #f1f5f9; color: var(--color-text); padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; }
.services { max-width: 1200px; margin: 0 auto; padding: 60px 40px; }
.services h2 { text-align: center; font-size: 28px; font-weight: 700; margin-bottom: 12px; }
.services .sub { text-align: center; color: var(--color-muted); font-size: 16px; margin-bottom: 48px; }
.services-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.svc-card { background: #f8fafc; border-radius: 12px; padding: 32px 24px; }
.svc-card .icon { width: 48px; height: 48px; background: #eff6ff; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 16px; }
.svc-card h3 { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
.svc-card p { font-size: 14px; color: var(--color-muted); line-height: 1.6; }
.team { max-width: 1200px; margin: 0 auto; padding: 60px 40px; }
.team h2 { text-align: center; font-size: 28px; font-weight: 700; margin-bottom: 40px; }
.team-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; text-align: center; }
.team-member .avatar { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg,#6366f1,#2563eb); margin: 0 auto 12px; }
.team-member h4 { font-size: 15px; font-weight: 600; }
.team-member p { font-size: 13px; color: var(--color-muted); }
footer { max-width: 1200px; margin: 0 auto; padding: 40px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 13px; color: var(--color-muted); }
@media (max-width: 768px) {
  nav { padding: 14px 20px; }
  .hero { padding: 50px 20px; }
  .hero-btns { flex-direction: column; align-items: center; }
  .services { padding: 40px 20px; }
  .services-grid { grid-template-columns: 1fr; }
  .team { padding: 40px 20px; }
  .team-grid { grid-template-columns: repeat(2, 1fr); }
  footer { padding: 20px; flex-direction: column; gap: 8px; }
}
</style>
</head>
<body>
<nav>
  <div class="logo">Apex</div>
  <ul>
    <li><a href="#services">Services</a></li>
    <li><a href="#team">Team</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#" class="nav-cta">Get Started</a></li>
  </ul>
</nav>
<section class="hero">
  <span class="badge">Trusted by 200+ companies</span>
  <h1>We build digital products that drive growth</h1>
  <p>Full-service design and development agency helping ambitious companies ship faster, scale smarter, and stand out.</p>
  <div class="hero-btns">
    <a href="#contact" class="btn-primary">Start a Project</a>
    <a href="#services" class="btn-secondary">Our Services</a>
  </div>
</section>
<section class="services" id="services">
  <h2>What We Do</h2>
  <p class="sub">End-to-end capabilities under one roof</p>
  <div class="services-grid">
    <div class="svc-card">
      <div class="icon">\u{1F3AF}</div>
      <h3>Brand Strategy</h3>
      <p>We define your positioning, messaging, and visual identity to create a brand that resonates with your audience.</p>
    </div>
    <div class="svc-card">
      <div class="icon">\u{1F4BB}</div>
      <h3>Web Development</h3>
      <p>Responsive, performant websites and web applications built with modern frameworks and best practices.</p>
    </div>
    <div class="svc-card">
      <div class="icon">\u{1F4F1}</div>
      <h3>Product Design</h3>
      <p>User-centered interfaces that delight customers and improve conversion through research-driven design.</p>
    </div>
  </div>
</section>
<section class="team" id="team">
  <h2>Meet the Team</h2>
  <div class="team-grid">
    <div class="team-member">
      <div class="avatar" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)"></div>
      <h4>Sarah Chen</h4><p>Creative Director</p>
    </div>
    <div class="team-member">
      <div class="avatar" style="background:linear-gradient(135deg,#2563eb,#3b82f6)"></div>
      <h4>Marcus Rivera</h4><p>Lead Engineer</p>
    </div>
    <div class="team-member">
      <div class="avatar" style="background:linear-gradient(135deg,#14b8a6,#22d3ee)"></div>
      <h4>Emily Park</h4><p>UX Designer</p>
    </div>
    <div class="team-member">
      <div class="avatar" style="background:linear-gradient(135deg,#f97316,#fbbf24)"></div>
      <h4>James Okafor</h4><p>Product Manager</p>
    </div>
  </div>
</section>
<footer>
  <span>2024 Apex Agency. All rights reserved.</span>
  <span>hello@apex.agency</span>
</footer>
</body>
</html>`,
};

const landingTemplate: PageTemplate = {
  id: 'landing',
  name: 'Product Landing Page',
  category: 'landing',
  emoji: '\u{1F680}',
  description: 'A conversion-focused landing page with features and pricing',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Product</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --color-primary: #8b5cf6;
  --color-bg: #fafafa;
  --color-text: #18181b;
  --color-muted: #71717a;
  --font-heading: 'Space Grotesk', sans-serif;
  --font-body: 'Inter', sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); background: var(--color-bg); color: var(--color-text); line-height: 1.6; }
a { color: inherit; text-decoration: none; }
nav { display: flex; justify-content: space-between; align-items: center; padding: 18px 40px; max-width: 1200px; margin: 0 auto; }
nav .logo { font-family: var(--font-heading); font-weight: 700; font-size: 20px; }
nav ul { list-style: none; display: flex; gap: 28px; align-items: center; }
nav a { font-size: 14px; color: var(--color-muted); }
.hero { max-width: 1200px; margin: 0 auto; padding: 80px 40px; text-align: center; }
.hero h1 { font-family: var(--font-heading); font-size: clamp(2.2rem,5vw,3.5rem); font-weight: 700; line-height: 1.15; max-width: 680px; margin: 0 auto 18px; }
.hero p { font-size: 18px; color: var(--color-muted); max-width: 520px; margin: 0 auto 32px; }
.hero-btns { display: flex; gap: 12px; justify-content: center; }
.btn-main { background: var(--color-primary); color: #fff; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; }
.btn-ghost { background: transparent; border: 1.5px solid #d4d4d8; color: var(--color-text); padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; }
.features { max-width: 1200px; margin: 0 auto; padding: 60px 40px; }
.features h2 { font-family: var(--font-heading); text-align: center; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.features .sub { text-align: center; color: var(--color-muted); font-size: 16px; margin-bottom: 48px; }
.feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.feat-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 28px 24px; }
.feat-card .icon { font-size: 28px; margin-bottom: 12px; }
.feat-card h3 { font-family: var(--font-heading); font-size: 17px; font-weight: 600; margin-bottom: 8px; }
.feat-card p { font-size: 14px; color: var(--color-muted); }
.pricing { max-width: 1200px; margin: 0 auto; padding: 60px 40px; }
.pricing h2 { font-family: var(--font-heading); text-align: center; font-size: 28px; font-weight: 700; margin-bottom: 40px; }
.price-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 900px; margin: 0 auto; }
.price-card { background: #fff; border: 1.5px solid #e4e4e7; border-radius: 12px; padding: 32px 24px; text-align: center; }
.price-card.featured { border-color: var(--color-primary); position: relative; }
.price-card h3 { font-family: var(--font-heading); font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.price-card .price { font-family: var(--font-heading); font-size: 36px; font-weight: 700; margin-bottom: 4px; }
.price-card .period { font-size: 13px; color: var(--color-muted); margin-bottom: 20px; }
.price-card ul { list-style: none; text-align: left; margin-bottom: 24px; }
.price-card li { font-size: 14px; padding: 6px 0; color: var(--color-muted); }
.price-card li::before { content: "\u2713 "; color: var(--color-primary); font-weight: 600; }
.price-btn { display: block; width: 100%; padding: 12px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; border: 1.5px solid #d4d4d8; background: transparent; color: var(--color-text); }
.price-card.featured .price-btn { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
footer { max-width: 1200px; margin: 0 auto; padding: 40px; border-top: 1px solid #e4e4e7; text-align: center; font-size: 13px; color: var(--color-muted); }
@media (max-width: 768px) {
  .hero { padding: 50px 20px; }
  .hero-btns { flex-direction: column; align-items: center; }
  .features { padding: 40px 20px; }
  .feat-grid { grid-template-columns: 1fr; }
  .pricing { padding: 40px 20px; }
  .price-grid { grid-template-columns: 1fr; }
  footer { padding: 20px; }
}
</style>
</head>
<body>
<nav>
  <div class="logo">Prism</div>
  <ul>
    <li><a href="#features">Features</a></li>
    <li><a href="#pricing">Pricing</a></li>
    <li><a href="#" class="btn-main" style="padding:8px 18px;font-size:13px">Get Started Free</a></li>
  </ul>
</nav>
<section class="hero">
  <h1>Ship your next product 10x faster</h1>
  <p>The all-in-one platform that helps teams design, build, and deploy web applications without the complexity.</p>
  <div class="hero-btns">
    <a href="#" class="btn-main">Start Free Trial</a>
    <a href="#features" class="btn-ghost">See How It Works</a>
  </div>
</section>
<section class="features" id="features">
  <h2>Everything You Need</h2>
  <p class="sub">Built for speed without sacrificing quality</p>
  <div class="feat-grid">
    <div class="feat-card">
      <div class="icon">\u26A1</div>
      <h3>Instant Deploy</h3>
      <p>Push to production in seconds with zero-config deployments. Automatic SSL, CDN, and edge caching included.</p>
    </div>
    <div class="feat-card">
      <div class="icon">\u{1F3A8}</div>
      <h3>Visual Builder</h3>
      <p>Design beautiful pages with drag-and-drop. No code required for layouts, but full code access when you need it.</p>
    </div>
    <div class="feat-card">
      <div class="icon">\u{1F4CA}</div>
      <h3>Built-In Analytics</h3>
      <p>Track visitors, conversions, and performance with privacy-friendly analytics. No third-party scripts needed.</p>
    </div>
  </div>
</section>
<section class="pricing" id="pricing">
  <h2>Simple, Transparent Pricing</h2>
  <div class="price-grid">
    <div class="price-card">
      <h3>Starter</h3>
      <div class="price">$0</div>
      <div class="period">free forever</div>
      <ul>
        <li>1 project</li>
        <li>Custom domain</li>
        <li>Basic analytics</li>
      </ul>
      <a href="#" class="price-btn">Get Started</a>
    </div>
    <div class="price-card featured">
      <h3>Pro</h3>
      <div class="price">$19</div>
      <div class="period">per month</div>
      <ul>
        <li>Unlimited projects</li>
        <li>Team collaboration</li>
        <li>Advanced analytics</li>
        <li>Priority support</li>
      </ul>
      <a href="#" class="price-btn">Start Free Trial</a>
    </div>
    <div class="price-card">
      <h3>Enterprise</h3>
      <div class="price">$49</div>
      <div class="period">per month</div>
      <ul>
        <li>Everything in Pro</li>
        <li>SSO &amp; SAML</li>
        <li>Dedicated support</li>
        <li>SLA guarantee</li>
      </ul>
      <a href="#" class="price-btn">Contact Sales</a>
    </div>
  </div>
</section>
<footer>
  <p>2024 Prism. Built for developers, designed for everyone.</p>
</footer>
</body>
</html>`,
};

const restaurantTemplate: PageTemplate = {
  id: 'restaurant',
  name: 'Restaurant & Cafe',
  category: 'restaurant',
  emoji: '\u{1F37D}\uFE0F',
  description: 'A warm, inviting site for restaurants and food businesses',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Restaurant</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
<style>
:root {
  --color-primary: #b45309;
  --color-bg: #fffbf5;
  --color-text: #292524;
  --color-muted: #78716c;
  --font-heading: 'Playfair Display', serif;
  --font-body: 'Lato', sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); background: var(--color-bg); color: var(--color-text); line-height: 1.6; }
a { color: inherit; text-decoration: none; }
nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; max-width: 1100px; margin: 0 auto; }
nav .logo { font-family: var(--font-heading); font-weight: 700; font-size: 26px; }
nav ul { list-style: none; display: flex; gap: 32px; }
nav a { font-size: 14px; font-weight: 400; color: var(--color-muted); letter-spacing: 1px; text-transform: uppercase; }
nav a:hover { color: var(--color-primary); }
.hero { text-align: center; padding: 80px 40px 60px; max-width: 1100px; margin: 0 auto; }
.hero h1 { font-family: var(--font-heading); font-size: clamp(2.5rem,6vw,4rem); font-weight: 700; line-height: 1.2; margin-bottom: 16px; }
.hero p { font-size: 18px; color: var(--color-muted); font-weight: 300; max-width: 500px; margin: 0 auto 32px; }
.hero-cta { display: inline-block; background: var(--color-primary); color: #fff; padding: 14px 32px; border-radius: 4px; font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.menu { max-width: 1100px; margin: 0 auto; padding: 60px 40px; }
.menu h2 { font-family: var(--font-heading); text-align: center; font-size: 32px; margin-bottom: 8px; }
.menu .sub { text-align: center; color: var(--color-muted); font-size: 16px; margin-bottom: 40px; }
.menu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px 48px; }
.menu-item { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 12px; border-bottom: 1px dotted #d6d3d1; }
.menu-item h3 { font-family: var(--font-heading); font-size: 18px; font-weight: 600; }
.menu-item .desc { font-size: 13px; color: var(--color-muted); margin-top: 2px; }
.menu-item .price { font-weight: 700; color: var(--color-primary); font-size: 16px; white-space: nowrap; }
.location { max-width: 1100px; margin: 0 auto; padding: 60px 40px; text-align: center; }
.location h2 { font-family: var(--font-heading); font-size: 28px; margin-bottom: 16px; }
.location p { font-size: 15px; color: var(--color-muted); max-width: 480px; margin: 0 auto; line-height: 1.8; }
footer { max-width: 1100px; margin: 0 auto; padding: 40px; border-top: 1px solid #e7e5e4; display: flex; justify-content: space-between; font-size: 13px; color: var(--color-muted); }
@media (max-width: 768px) {
  nav { padding: 16px 20px; }
  .hero { padding: 50px 20px 40px; }
  .menu { padding: 40px 20px; }
  .menu-grid { grid-template-columns: 1fr; }
  .location { padding: 40px 20px; }
  footer { padding: 20px; flex-direction: column; gap: 8px; }
}
</style>
</head>
<body>
<nav>
  <div class="logo">Ember</div>
  <ul>
    <li><a href="#menu">Menu</a></li>
    <li><a href="#location">Visit</a></li>
    <li><a href="#reserve">Reserve</a></li>
  </ul>
</nav>
<section class="hero">
  <h1>Food crafted with passion</h1>
  <p>Farm-to-table dining in the heart of the city. Seasonal ingredients, timeless flavors, unforgettable moments.</p>
  <a href="#reserve" class="hero-cta">Reserve a Table</a>
</section>
<section class="menu" id="menu">
  <h2>Our Menu</h2>
  <p class="sub">Seasonal highlights from our kitchen</p>
  <div class="menu-grid">
    <div>
      <div class="menu-item"><div><h3>Roasted Beet Salad</h3><p class="desc">Goat cheese, walnuts, honey vinaigrette</p></div><span class="price">$14</span></div>
      <div class="menu-item"><div><h3>Grilled Salmon</h3><p class="desc">Lemon butter, seasonal vegetables, rice pilaf</p></div><span class="price">$28</span></div>
      <div class="menu-item"><div><h3>Mushroom Risotto</h3><p class="desc">Wild mushrooms, parmesan, truffle oil</p></div><span class="price">$22</span></div>
    </div>
    <div>
      <div class="menu-item"><div><h3>Pan-Seared Duck</h3><p class="desc">Cherry glaze, roasted root vegetables</p></div><span class="price">$32</span></div>
      <div class="menu-item"><div><h3>Burrata Bruschetta</h3><p class="desc">Heirloom tomatoes, basil, aged balsamic</p></div><span class="price">$16</span></div>
      <div class="menu-item"><div><h3>Chocolate Fondant</h3><p class="desc">Salted caramel center, vanilla ice cream</p></div><span class="price">$12</span></div>
    </div>
  </div>
</section>
<section class="location" id="location">
  <h2>Visit Us</h2>
  <p>
    127 Oak Street, Downtown<br>
    Open Tuesday through Sunday<br>
    Lunch: 11:30am -- 2:30pm<br>
    Dinner: 5:30pm -- 10:00pm<br><br>
    Reservations: (555) 234-5678
  </p>
</section>
<footer>
  <span>2024 Ember Restaurant</span>
  <span>hello@ember.kitchen</span>
</footer>
</body>
</html>`,
};

const personalTemplate: PageTemplate = {
  id: 'personal',
  name: 'Personal Blog / About',
  category: 'personal',
  emoji: '\u{270D}\uFE0F',
  description: 'A minimal personal site with blog-style content',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Personal Site</title>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --color-primary: #0ea5e9;
  --color-bg: #ffffff;
  --color-text: #1a1a2e;
  --color-muted: #6b7280;
  --font-heading: 'Source Serif 4', serif;
  --font-body: 'Inter', sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); background: var(--color-bg); color: var(--color-text); line-height: 1.7; }
a { color: var(--color-primary); text-decoration: none; }
a:hover { text-decoration: underline; }
.container { max-width: 720px; margin: 0 auto; padding: 0 24px; }
nav { padding: 24px 0; display: flex; justify-content: space-between; align-items: center; }
nav .logo { font-family: var(--font-heading); font-weight: 700; font-size: 20px; color: var(--color-text); }
nav ul { list-style: none; display: flex; gap: 24px; }
nav a { font-size: 14px; color: var(--color-muted); text-decoration: none; }
nav a:hover { color: var(--color-text); text-decoration: none; }
.hero { padding: 60px 0 48px; }
.hero .photo { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg,#0ea5e9,#6366f1); margin-bottom: 20px; }
.hero h1 { font-family: var(--font-heading); font-size: 32px; font-weight: 700; line-height: 1.3; margin-bottom: 12px; }
.hero p { font-size: 16px; color: var(--color-muted); max-width: 540px; }
.writing { padding: 32px 0 48px; }
.writing h2 { font-family: var(--font-heading); font-size: 22px; font-weight: 600; margin-bottom: 24px; }
.post { padding: 20px 0; border-bottom: 1px solid #f3f4f6; }
.post:first-child { border-top: 1px solid #f3f4f6; }
.post h3 { font-family: var(--font-heading); font-size: 18px; font-weight: 600; margin-bottom: 4px; }
.post h3 a { color: var(--color-text); }
.post h3 a:hover { color: var(--color-primary); text-decoration: none; }
.post .meta { font-size: 13px; color: var(--color-muted); margin-bottom: 6px; }
.post p { font-size: 14px; color: var(--color-muted); }
.about { padding: 32px 0 48px; }
.about h2 { font-family: var(--font-heading); font-size: 22px; font-weight: 600; margin-bottom: 16px; }
.about p { font-size: 15px; color: var(--color-muted); margin-bottom: 12px; }
footer { padding: 32px 0; border-top: 1px solid #f3f4f6; font-size: 13px; color: var(--color-muted); display: flex; justify-content: space-between; }
@media (max-width: 768px) {
  .hero { padding: 40px 0 32px; }
  footer { flex-direction: column; gap: 8px; }
}
</style>
</head>
<body>
<div class="container">
<nav>
  <div class="logo">Alex Morgan</div>
  <ul>
    <li><a href="#writing">Writing</a></li>
    <li><a href="#about">About</a></li>
    <li><a href="mailto:hello@alexmorgan.dev">Contact</a></li>
  </ul>
</nav>
<section class="hero">
  <div class="photo"></div>
  <h1>Hi, I'm Alex. I write about design, technology, and creative work.</h1>
  <p>Product designer by day, writer by night. Currently building tools at a startup in San Francisco. Previously at Google and Figma.</p>
</section>
<section class="writing" id="writing">
  <h2>Recent Writing</h2>
  <article class="post">
    <h3><a href="#">The case for designing in the browser</a></h3>
    <div class="meta">January 2024</div>
    <p>Why I stopped using Figma for production design and switched to building directly in code.</p>
  </article>
  <article class="post">
    <h3><a href="#">How we reduced our design system to 12 components</a></h3>
    <div class="meta">December 2023</div>
    <p>Lessons learned from simplifying a 200-component design system into something teams actually use.</p>
  </article>
  <article class="post">
    <h3><a href="#">Remote work and the death of the open office</a></h3>
    <div class="meta">November 2023</div>
    <p>Three years into remote work, here's what I've learned about productivity and collaboration.</p>
  </article>
</section>
<section class="about" id="about">
  <h2>About</h2>
  <p>I'm a product designer with 8 years of experience building digital products. I specialize in design systems, developer tools, and making complex workflows feel simple.</p>
  <p>When I'm not designing, you'll find me hiking in Marin, experimenting with film photography, or working on my newsletter.</p>
</section>
<footer>
  <span>2024 Alex Morgan</span>
  <span>
    <a href="#">Twitter</a> / <a href="#">GitHub</a> / <a href="#">LinkedIn</a>
  </span>
</footer>
</div>
</body>
</html>`,
};

const creativeTemplate: PageTemplate = {
  id: 'creative',
  name: 'Freelancer / Consultant',
  category: 'creative',
  emoji: '\u{1F4BC}',
  description: 'Bold typography and clean layout for freelancers',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Freelancer</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --color-primary: #f43f5e;
  --color-bg: #fafaf9;
  --color-text: #1c1917;
  --color-muted: #78716c;
  --font-heading: 'Sora', sans-serif;
  --font-body: 'Inter', sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); background: var(--color-bg); color: var(--color-text); line-height: 1.6; }
a { color: inherit; text-decoration: none; }
nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; max-width: 1200px; margin: 0 auto; }
nav .logo { font-family: var(--font-heading); font-weight: 800; font-size: 20px; }
nav ul { list-style: none; display: flex; gap: 28px; align-items: center; }
nav a { font-size: 14px; color: var(--color-muted); }
.nav-hire { background: var(--color-primary); color: #fff !important; padding: 8px 18px; border-radius: 6px; font-weight: 600; font-size: 13px; }
.hero { max-width: 1200px; margin: 0 auto; padding: 100px 40px 80px; }
.hero .tag { display: inline-block; font-family: var(--font-heading); font-size: 12px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: var(--color-primary); margin-bottom: 20px; }
.hero h1 { font-family: var(--font-heading); font-size: clamp(2.5rem,6vw,4.5rem); font-weight: 800; line-height: 1.05; letter-spacing: -2px; margin-bottom: 24px; }
.hero p { font-size: 18px; color: var(--color-muted); max-width: 520px; margin-bottom: 36px; }
.hero-cta { display: inline-flex; align-items: center; gap: 8px; background: var(--color-text); color: #fff; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; }
.skills { max-width: 1200px; margin: 0 auto; padding: 40px 40px 60px; }
.skills h2 { font-family: var(--font-heading); font-size: 14px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--color-muted); margin-bottom: 24px; }
.skill-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.skill-card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 24px 20px; }
.skill-card h3 { font-family: var(--font-heading); font-size: 16px; font-weight: 600; margin-bottom: 6px; }
.skill-card p { font-size: 13px; color: var(--color-muted); }
.testimonial { max-width: 1200px; margin: 0 auto; padding: 60px 40px; }
.testimonial-box { background: #fff; border: 1px solid #e7e5e4; border-radius: 16px; padding: 48px; max-width: 720px; margin: 0 auto; text-align: center; }
.testimonial-box blockquote { font-family: var(--font-heading); font-size: 22px; font-weight: 500; line-height: 1.5; margin-bottom: 20px; }
.testimonial-box .author { font-size: 14px; color: var(--color-muted); }
.testimonial-box .author strong { color: var(--color-text); }
footer { max-width: 1200px; margin: 0 auto; padding: 40px; border-top: 1px solid #e7e5e4; display: flex; justify-content: space-between; font-size: 13px; color: var(--color-muted); }
@media (max-width: 768px) {
  nav { padding: 16px 20px; }
  .hero { padding: 60px 20px 40px; }
  .skills { padding: 20px 20px 40px; }
  .skill-grid { grid-template-columns: 1fr 1fr; }
  .testimonial { padding: 40px 20px; }
  .testimonial-box { padding: 28px 20px; }
  .testimonial-box blockquote { font-size: 18px; }
  footer { padding: 20px; flex-direction: column; gap: 8px; }
}
</style>
</head>
<body>
<nav>
  <div class="logo">J. Carter</div>
  <ul>
    <li><a href="#skills">Services</a></li>
    <li><a href="#work">Work</a></li>
    <li><a href="#" class="nav-hire">Hire Me</a></li>
  </ul>
</nav>
<section class="hero">
  <span class="tag">Independent Consultant</span>
  <h1>I help companies<br>build better<br>products</h1>
  <p>Product strategy, UX design, and front-end development for startups and growing companies. Over 10 years of experience shipping products people love.</p>
  <a href="#contact" class="hero-cta">Let's Work Together</a>
</section>
<section class="skills" id="skills">
  <h2>What I Do</h2>
  <div class="skill-grid">
    <div class="skill-card">
      <h3>Product Strategy</h3>
      <p>Roadmaps, user research, market analysis, and go-to-market planning.</p>
    </div>
    <div class="skill-card">
      <h3>UX Design</h3>
      <p>Wireframes, prototypes, user testing, and design system creation.</p>
    </div>
    <div class="skill-card">
      <h3>Front-End Dev</h3>
      <p>React, TypeScript, CSS, and modern build tools. Pixel-perfect implementation.</p>
    </div>
    <div class="skill-card">
      <h3>Growth</h3>
      <p>Conversion optimization, A/B testing, analytics setup, and funnel analysis.</p>
    </div>
  </div>
</section>
<section class="testimonial">
  <div class="testimonial-box">
    <blockquote>"Jordan completely transformed our product experience. Our conversion rate doubled within three months of implementing the redesign."</blockquote>
    <div class="author"><strong>Lisa Chen</strong>, CEO at Vantage</div>
  </div>
</section>
<footer>
  <span>2024 Jordan Carter. Available for new projects.</span>
  <span>jordan@carter.consulting</span>
</footer>
</body>
</html>`,
};

const annualReportTemplate: PageTemplate = {
  id: 'annual-report',
  name: 'Year in Review',
  category: 'report',
  emoji: '\u{1F4CA}',
  description: 'A dark, immersive annual report with animated stats, progress rings, and section storytelling',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Year in Review | Acme Corp</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
<style>
/* ===== DESIGN TOKENS — swap these to re-theme the entire page ===== */
:root {
  --color-bg: #0a1628;
  --color-primary: #10b981;
  --color-text: #ffffff;
  --navy: #0a1628;
  --navy-deep: #060e1a;
  --navy-90: rgba(10,22,40,.92);
  --blue: #2563eb;
  --blue-light: #3b82f6;
  --green: #10b981;
  --yellow: #f59e0b;
  --white: #ffffff;
  --gray-50: #f8f9fa;
  --gray-200: #e2e6ee;
  --gray-400: #94a3b8;
  --gray-600: #475569;
  --gray-800: #1e293b;
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --margin: 3rem;
  --gutter: 1.5rem;
  --space-sm: 1rem;
  --space-md: 1.5rem;
  --space-lg: 2.5rem;
  --space-xl: 4rem;
  --space-2xl: 6rem;
  --space-3xl: 8rem;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-xl: 28px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,.06);
  --shadow-md: 0 4px 16px rgba(0,0,0,.08);
  --shadow-lg: 0 8px 30px rgba(0,0,0,.12);
  --text-xs: .75rem;
  --text-sm: .875rem;
  --text-md: .9375rem;
  --text-lg: clamp(1.05rem, 1.5vw, 1.15rem);
  --text-xl: clamp(1.15rem, 2vw, 1.35rem);
  --text-2xl: clamp(1.35rem, 2.2vw, 1.65rem);
  --text-3xl: clamp(1.85rem, 4vw, 2.75rem);
  --text-4xl: clamp(2rem, 4vw, 3rem);
  --text-5xl: clamp(2.4rem, 5.5vw, 4rem);
  --text-stat: clamp(2.25rem, 4vw, 3rem);
  --text-card-stat: clamp(1.8rem, 3vw, 2.5rem);
  --text-marker: clamp(80px, 10vw, 140px);
  --ease: cubic-bezier(.25,.1,.25,1);
}
/* ===== RESET ===== */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:var(--font);font-size:17px;line-height:1.5;color:var(--gray-800);background:var(--white);overflow-x:hidden;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%;height:auto}a{color:var(--blue);text-decoration:none}strong{font-weight:700}
a:focus-visible,button:focus-visible{outline:2px solid var(--green);outline-offset:2px;border-radius:4px}
::selection{background:rgba(16,185,129,.2);color:var(--navy)}
.container{max-width:1140px;margin:0 auto;padding:0 var(--margin)}
.skip-link{position:absolute;top:-100%;left:1rem;z-index:9999;padding:.75rem 1.25rem;background:var(--navy);color:#fff;font-weight:600;font-size:var(--text-sm);border-radius:6px;text-decoration:none}
.skip-link:focus{top:1rem}
/* ===== COMPONENT: Sticky nav with scroll progress bar ===== */
.sticky-nav{position:fixed;top:0;left:0;right:0;z-index:1000;transform:translateY(-100%);opacity:0;transition:transform .5s var(--ease),opacity .5s var(--ease)}
.sticky-nav.visible{transform:translateY(0);opacity:1}
.sticky-nav__bar{background:var(--navy-90);backdrop-filter:blur(16px) saturate(1.4);position:relative}
.scroll-progress{position:absolute;bottom:0;left:0;width:0%;height:2px;background:linear-gradient(90deg,var(--blue),var(--green),var(--yellow));z-index:1}
.sticky-nav__inner{display:flex;align-items:center;gap:var(--space-md);padding:.6rem var(--space-md);max-width:1140px;margin:0 auto;overflow-x:auto;scrollbar-width:none}
.sticky-nav__inner::-webkit-scrollbar{display:none}
.sticky-nav__brand-text{font-weight:700;font-size:var(--text-sm);color:var(--white);letter-spacing:.04em}
.sticky-nav__links{display:flex;gap:.2rem;list-style:none;margin-left:auto}
.sticky-nav__link{color:rgba(255,255,255,.88);font-size:var(--text-sm);font-weight:600;padding:.35rem .85rem;border-radius:100px;white-space:nowrap;transition:color .3s,background .3s}
.sticky-nav__link:hover{color:var(--white);background:rgba(255,255,255,.07)}
.sticky-nav__link.active{color:var(--white);background:var(--blue)}
/* ===== COMPONENT: Full-viewport hero with canvas dot matrix ===== */
.hero{position:relative;min-height:100vh;display:flex;flex-direction:column;justify-content:center;background:var(--navy-deep);color:var(--white);overflow:hidden}
.hero__bg{position:absolute;inset:0;z-index:0;background:radial-gradient(ellipse at 65% 40%,rgba(37,99,235,.15) 0%,transparent 60%),radial-gradient(ellipse at 20% 80%,rgba(16,185,129,.1) 0%,transparent 50%),var(--navy-deep)}
.hero__dots{position:absolute;inset:0;width:100%;height:100%;z-index:1}
.hero__overlay{position:absolute;inset:0;z-index:2;background:linear-gradient(to right,rgba(6,14,26,.96) 0%,rgba(6,14,26,.8) 30%,rgba(6,14,26,.3) 60%,transparent 80%),linear-gradient(to bottom,rgba(6,14,26,.1) 0%,transparent 30%,transparent 60%,rgba(6,14,26,.95) 100%)}
.hero__particles{position:absolute;inset:0;z-index:3;overflow:hidden;pointer-events:none}
.particle{position:absolute;width:3px;height:3px;background:var(--green);border-radius:50%;opacity:0;animation:float-particle 12s infinite}
.particle:nth-child(1){left:12%;animation-delay:0s}
.particle:nth-child(2){left:42%;animation-delay:3s;animation-duration:14s}
.particle:nth-child(3){left:72%;animation-delay:6s;animation-duration:11s}
.particle:nth-child(4){left:86%;animation-delay:9s;width:2px;height:2px;background:var(--blue-light)}
@keyframes float-particle{0%{transform:translateY(100vh);opacity:0}8%{opacity:.4}92%{opacity:.4}100%{transform:translateY(-10vh);opacity:0}}
.hero__content{position:relative;z-index:4;padding:0 var(--space-md);max-width:1140px;margin:0 auto;width:100%}
.hero__eyebrow{display:inline-block;font-size:var(--text-sm);font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--green);margin-bottom:.5rem;opacity:0;animation:fade-up .8s .3s ease forwards}
.hero-title{font-size:var(--text-5xl);font-weight:300;line-height:1.0;letter-spacing:-.01em;opacity:0;animation:fade-up .8s .5s ease forwards}
.hero-title .highlight{font-weight:400;background:linear-gradient(135deg,var(--green),var(--blue-light));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero__tagline{font-size:var(--text-lg);font-weight:400;margin-top:var(--space-sm);color:rgba(255,255,255,.9);opacity:0;animation:fade-up .8s .7s ease forwards}
.hero__divider{width:48px;height:2px;background:var(--green);margin:var(--space-md) 0;opacity:0;animation:fade-up .8s .9s ease forwards}
.hero__prose{max-width:620px;font-size:var(--text-md);line-height:1.5;color:rgba(255,255,255,.85);opacity:0;animation:fade-up .8s 1.1s ease forwards}
.hero__prose p+p{margin-top:var(--space-sm)}.hero__prose strong{color:var(--white)}
@keyframes fade-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.hero__scroll-cue{position:absolute;bottom:2rem;left:50%;transform:translateX(-50%);z-index:4;display:flex;flex-direction:column;align-items:center;gap:.5rem;color:rgba(255,255,255,.7);font-size:var(--text-xs);letter-spacing:.2em;text-transform:uppercase;font-weight:600}
.scroll-line{width:1px;height:32px;background:rgba(255,255,255,.2);position:relative;overflow:hidden}
.scroll-line::after{content:'';position:absolute;top:-100%;left:0;width:100%;height:100%;background:var(--green);animation:scroll-drop 2.5s ease-in-out infinite}
@keyframes scroll-drop{0%{top:-100%}40%{top:100%}100%{top:100%}}
/* ===== LAYOUT: Section variants ===== */
.section{position:relative;padding:var(--space-2xl) 0}
.section--dark{background:var(--navy);color:var(--white)}
.section--deep{background:var(--navy-deep);color:var(--white)}
.section--gray{background:var(--gray-50)}
.section--light{background:var(--white)}
/* ===== TYPOGRAPHY ===== */
h2{font-size:var(--text-3xl);font-weight:500;line-height:1.2;margin-bottom:var(--space-sm);color:var(--navy);overflow:hidden}
.section--dark h2,.section--deep h2{color:var(--white)}
h2 .word{display:inline-block;opacity:0;transform:scale(1.3);animation:word-scale-in .6s var(--ease) forwards}
h2 .word:nth-child(1){animation-delay:0s}h2 .word:nth-child(2){animation-delay:.08s}h2 .word:nth-child(3){animation-delay:.16s}
h2 .word:nth-child(4){animation-delay:.24s}h2 .word:nth-child(5){animation-delay:.32s}h2 .word:nth-child(6){animation-delay:.4s}
@keyframes word-scale-in{to{opacity:1;transform:scale(1)}}
h3{font-size:var(--text-xl);font-weight:700;margin-bottom:var(--space-sm);color:var(--navy)}
.section--dark h3,.section--deep h3{color:var(--white)}
.lead{font-size:var(--text-lg);line-height:1.5;color:var(--gray-600);margin-top:.25rem;margin-bottom:var(--space-sm)}
.section--dark .lead,.section--deep .lead{color:rgba(255,255,255,.9)}
/* ===== COMPONENT: Pillar badge (category tag) ===== */
.pillar-badge{display:inline-block;font-size:var(--text-xs);font-weight:700;padding:.3rem .85rem;border-radius:100px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.75rem;color:var(--white);background:var(--blue)}
/* ===== COMPONENT: Section number watermark ===== */
.section-marker{position:absolute;top:2rem;right:2rem;font-size:var(--text-marker);font-weight:700;line-height:1;color:var(--navy);opacity:.05;pointer-events:none;user-select:none;z-index:0}
.section--dark .section-marker,.section--deep .section-marker{color:var(--white);opacity:.03}
/* ===== COMPONENT: Stats row with animated counters ===== */
.stats-row{display:flex;flex-wrap:wrap;align-items:stretch;gap:var(--gutter);margin:var(--space-sm) 0 var(--space-lg)}
.stat-inline{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:var(--space-md) var(--space-lg);background:var(--navy);border-radius:var(--radius-md);min-width:140px;transition:transform .15s ease-out;will-change:transform}
.section--dark .stat-inline,.section--deep .stat-inline{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}
.section--light .stat-inline,.section--gray .stat-inline{border:1px solid var(--gray-200)}
.stat-inline__number{font-size:var(--text-stat);font-weight:300;color:var(--green);line-height:1.1;letter-spacing:-.02em}
.stat-inline__label{font-size:var(--text-sm);color:rgba(255,255,255,.9);font-weight:500;margin-top:.4rem}
.section--light .stat-inline__label,.section--gray .stat-inline__label{color:var(--gray-600)}
/* ===== COMPONENT: Impact cards with left-border accent ===== */
.impact-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--gutter);margin:var(--space-sm) 0 var(--space-lg)}
.impact-cards--asymmetric{grid-template-columns:1.5fr 1fr 1fr}
.impact-card{background:var(--white);border-radius:var(--radius-md);padding:var(--space-md);border-left:3px solid var(--green);box-shadow:var(--shadow-sm);transition:box-shadow .4s var(--ease),transform .15s ease-out;will-change:transform}
.impact-card:hover{box-shadow:var(--shadow-md)}
.section--dark .impact-card,.section--deep .impact-card{background:rgba(255,255,255,.06);border-left-color:var(--green)}
.impact-card__stat{font-size:var(--text-card-stat);font-weight:700;color:var(--blue);line-height:1.1;margin-bottom:.25rem}
.section--dark .impact-card__stat,.section--deep .impact-card__stat{color:var(--green)}
.impact-card__label{font-size:var(--text-sm);font-weight:600;color:var(--gray-600);margin-bottom:.5rem}
.section--dark .impact-card__label,.section--deep .impact-card__label{color:rgba(255,255,255,.9)}
.impact-card__desc{font-size:var(--text-sm);line-height:1.6;color:var(--gray-800)}
.section--dark .impact-card__desc,.section--deep .impact-card__desc{color:rgba(255,255,255,.8)}
/* ===== COMPONENT: SVG progress ring ===== */
.progress-ring{width:120px;height:120px;margin:0 auto var(--space-sm)}
.impact-card .progress-ring{margin-bottom:1rem}
.progress-ring__circle{fill:none;stroke-width:6;transform:rotate(-90deg);transform-origin:50% 50%}
.progress-ring__bg{stroke:rgba(16,185,129,.1)}
.progress-ring__progress{stroke:var(--green);stroke-linecap:round;transition:stroke-dashoffset 3.5s cubic-bezier(.25,.1,.25,1)}
.section--dark .progress-ring__bg,.section--deep .progress-ring__bg{stroke:rgba(255,255,255,.08)}
.progress-ring__text{font-size:28px;font-weight:700;fill:var(--navy)}
.section--dark .progress-ring__text,.section--deep .progress-ring__text{fill:var(--white)}
.progress-stat{text-align:center}
.progress-stat__label{font-size:var(--text-sm);font-weight:600;color:var(--gray-600)}
.section--dark .progress-stat__label,.section--deep .progress-stat__label{color:rgba(255,255,255,.9)}
/* ===== COMPONENT: Content block with bullet list ===== */
.content-block{margin-bottom:var(--space-md)}
.impact-cards+.content-block,.stats-row+.content-block,.emphasis-block+.content-block{margin-top:var(--space-lg);padding-top:var(--space-md);border-top:1px solid rgba(0,0,0,.06)}
.section--dark .impact-cards+.content-block,.section--dark .stats-row+.content-block,.section--deep .impact-cards+.content-block,.section--deep .stats-row+.content-block{border-top-color:rgba(255,255,255,.08)}
.content-block p{margin-bottom:var(--space-sm);line-height:1.5}
.content-block ul{list-style:none;margin:var(--space-md) 0}
.content-block li{padding-left:1.5rem;position:relative;margin-bottom:.75rem;line-height:1.5}
.content-block li::before{content:'';position:absolute;left:0;top:.65em;width:6px;height:6px;background:var(--green);border-radius:50%}
/* ===== COMPONENT: Emphasis paragraph ===== */
.emphasis-block{margin:var(--space-sm) 0 var(--space-lg);font-size:var(--text-lg);line-height:1.5;color:var(--gray-600)}
.emphasis-block em{font-style:normal;font-weight:700;color:var(--navy)}
.section--dark .emphasis-block,.section--deep .emphasis-block{color:rgba(255,255,255,.9)}
.section--dark .emphasis-block em,.section--deep .emphasis-block em{color:var(--white)}
/* ===== COMPONENT: Editorial pull quote ===== */
.editorial-quote{position:relative;margin:var(--space-sm) 0 var(--space-lg) -2rem;padding:var(--space-md) var(--space-lg) var(--space-md) var(--space-xl);max-width:720px}
.editorial-quote__mark{position:absolute;left:-1rem;top:-1rem;font-size:clamp(100px,12vw,160px);font-weight:700;line-height:1;color:var(--green);opacity:.1;font-family:Georgia,serif;pointer-events:none}
.editorial-quote__text{font-size:var(--text-2xl);font-weight:300;line-height:1.2;color:var(--navy);position:relative;z-index:1}
.section--dark .editorial-quote__text,.section--deep .editorial-quote__text{color:var(--white)}
/* ===== LAYOUT: Responsive two-column ===== */
.two-col{display:grid;grid-template-columns:1fr;gap:var(--space-lg);align-items:start;margin-bottom:var(--space-lg)}
@media(min-width:768px){.two-col{grid-template-columns:1fr 1fr}.two-col--reverse .two-col__media{order:-1}}
.two-col__media{border-radius:var(--radius-xl);overflow:hidden;box-shadow:var(--shadow-lg);opacity:0;transform:scale(.95)}
.two-col__media.visible{opacity:1;transform:scale(1);transition:opacity .8s var(--ease),transform .8s var(--ease)}
/* ===== COMPONENT: Centered text intro ===== */
.centered-text{text-align:center;max-width:760px;margin:0 auto var(--space-xl)}
.centered-text p{font-size:var(--text-lg);line-height:1.5;margin-bottom:.75rem}
/* ===== COMPONENT: Full-bleed SVG visualization ===== */
.section-viz{width:100vw;position:relative;left:50%;right:50%;margin-left:-50vw;margin-right:-50vw;margin-top:var(--space-md);margin-bottom:var(--space-md)}
.section-viz svg,.section-viz img{width:100%;height:auto;display:block}
/* ===== COMPONENT: Photo grid with stagger reveal ===== */
.photo-grid{display:grid;gap:var(--gutter);margin:var(--space-md) 0 var(--space-lg)}
.photo-grid--2col{grid-template-columns:repeat(2,1fr)}
.photo-grid--3col{grid-template-columns:repeat(3,1fr)}
.photo-item{border-radius:var(--radius-lg);overflow:hidden;opacity:0;transform:scale(.95)}
.photo-item.visible{opacity:1;transform:scale(1);transition:opacity .8s var(--ease),transform .8s var(--ease)}
.photo-item:hover{transform:translateY(-3px)}
/* ===== COMPONENT: Priorities overview (dark section, animated SVG icon draw) ===== */
.priorities-overview{background:var(--navy);padding:var(--space-3xl) 0;color:var(--white);overflow:hidden}
.priorities-overview__title{text-align:center;font-size:var(--text-3xl);font-weight:500;margin-bottom:var(--space-xl);color:var(--white);opacity:0;transform:translateY(12px);transition:opacity .6s var(--ease),transform .6s var(--ease)}
.priorities-overview.visible .priorities-overview__title{opacity:1;transform:none}
.priorities-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-lg);max-width:1140px;margin:0 auto;padding:0 var(--margin)}
.priority-item{text-align:center;display:flex;flex-direction:column;align-items:center;gap:.85rem;padding:var(--space-md);text-decoration:none;color:inherit}
.priority-item__icon-wrap{width:100px;height:100px;display:flex;align-items:center;justify-content:center}
/* SVG stroke-draw + fill-in animation on scroll-into-view */
.pri-svg{width:80px;height:80px;overflow:visible}
.pri-svg path{fill:transparent;stroke:var(--green);stroke-width:2;stroke-dasharray:20000;stroke-dashoffset:20000;stroke-linecap:round;stroke-linejoin:round;transition:stroke-dashoffset 2.2s cubic-bezier(.4,0,.2,1),fill .7s ease}
.priorities-overview.visible .pri-svg path{stroke-dashoffset:0;fill:var(--green)}
.priority-item:nth-child(1) .pri-svg path{transition-delay:.2s,2s}
.priority-item:nth-child(2) .pri-svg path{transition-delay:.5s,2.3s}
.priority-item:nth-child(3) .pri-svg path{transition-delay:.8s,2.6s}
.priority-item:nth-child(4) .pri-svg path{transition-delay:1.1s,2.9s}
.priority-item__title{font-size:var(--text-sm);font-weight:700;color:var(--white);letter-spacing:.03em}
.priority-item__desc{font-size:var(--text-xs);color:rgba(255,255,255,.6);line-height:1.5}
/* ===== COMPONENT: Closing section with radial glow + back-to-top ===== */
.closing{position:relative;overflow:hidden;padding:0}
.closing__visual{position:relative;width:100%;max-height:400px;overflow:hidden}
.closing__visual-inner{width:100%;height:400px;background:linear-gradient(135deg,var(--navy-deep) 0%,#132a52 50%,var(--navy-deep) 100%);position:relative}
.closing__visual-inner::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 60%,rgba(16,185,129,.15) 0%,transparent 60%)}
.closing__visual::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,transparent 0%,var(--navy-deep) 100%)}
.closing__text{position:relative;z-index:1;text-align:center;padding:var(--space-2xl) var(--margin) var(--space-3xl);max-width:760px;margin:0 auto}
.closing__tagline{font-size:var(--text-4xl);font-weight:300;color:var(--white);line-height:1.0;margin-bottom:var(--space-lg)}
.closing__tagline strong{font-weight:500}
.closing__divider{width:48px;height:2px;background:var(--green);margin:0 auto var(--space-lg)}
.closing__body{font-size:var(--text-lg);line-height:1.5;color:rgba(255,255,255,.85);margin-bottom:var(--space-md)}
.closing__body strong{color:var(--white)}
.back-to-top{display:inline-flex;align-items:center;gap:.5rem;color:rgba(255,255,255,.8);font-size:var(--text-sm);font-weight:600;padding:.6rem 1.2rem;border:1px solid rgba(255,255,255,.3);border-radius:100px;transition:all .3s;background:none;cursor:pointer;font-family:inherit;margin-top:var(--space-lg)}
.back-to-top:hover{color:var(--white);border-color:rgba(255,255,255,.6)}
.back-to-top svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5}
/* ===== ANIMATIONS: Intersection-observer-triggered reveals ===== */
.reveal{opacity:0;transform:translateY(20px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
.reveal--left{opacity:0;transform:translateX(-24px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
.reveal--right{opacity:0;transform:translateX(24px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
.reveal.visible,.reveal--left.visible,.reveal--right.visible{opacity:1;transform:none}
.reveal--stagger>*{opacity:0;transition:opacity .6s var(--ease),transform .6s var(--ease)}
.reveal--stagger>*:nth-child(1){transform:translateY(20px)}
.reveal--stagger>*:nth-child(2){transform:translateY(25px)}
.reveal--stagger>*:nth-child(3){transform:translateY(18px)}
.reveal--stagger>*:nth-child(4){transform:translateY(22px)}
.reveal--stagger.visible>*:nth-child(1){transition-delay:0s;opacity:1;transform:none}
.reveal--stagger.visible>*:nth-child(2){transition-delay:.15s;opacity:1;transform:none}
.reveal--stagger.visible>*:nth-child(3){transition-delay:.25s;opacity:1;transform:none}
.reveal--stagger.visible>*:nth-child(4){transition-delay:.38s;opacity:1;transform:none}
/* ===== RESPONSIVE ===== */
@media(max-width:767px){
  :root{--margin:1.25rem;--space-2xl:4rem;--space-3xl:5rem}
  .priorities-grid{grid-template-columns:repeat(2,1fr)}
  .impact-cards--asymmetric{grid-template-columns:1fr}
  .photo-grid--2col,.photo-grid--3col{grid-template-columns:1fr}
  .editorial-quote{margin-left:0}
  .hero__content{padding-top:20vh;padding-bottom:var(--space-2xl)}
}
/* ===== REDUCED MOTION ===== */
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
  .reveal,.reveal--left,.reveal--right,.reveal--stagger,.reveal--stagger>*,.photo-item,.two-col__media{opacity:1;transform:none}
  .hero__eyebrow,.hero-title,.hero__tagline,.hero__divider,.hero__prose{opacity:1;animation:none}
  .particle{display:none}
}
</style>
</head>
<body>

<a href="#innovation" class="skip-link">Skip to main content</a>

<!-- Sticky nav + scroll progress bar (slides down after scrolling past hero) -->
<nav class="sticky-nav" id="stickyNav" aria-label="Section navigation">
  <div class="sticky-nav__bar">
    <div class="scroll-progress" id="scrollProgress"></div>
    <div class="sticky-nav__inner">
      <span class="sticky-nav__brand-text">Year in Review 2024</span>
      <ul class="sticky-nav__links">
        <li><a href="#innovation" class="sticky-nav__link" data-section="innovation">Innovation</a></li>
        <li><a href="#customers" class="sticky-nav__link" data-section="customers">Customers</a></li>
        <li><a href="#operations" class="sticky-nav__link" data-section="operations">Operations</a></li>
        <li><a href="#ahead" class="sticky-nav__link" data-section="ahead">Looking Ahead</a></li>
      </ul>
    </div>
  </div>
</nav>

<!-- Hero: full-viewport dark canvas with animated dot-matrix halftone, floating particles, staggered text entrance -->
<section class="hero">
  <div class="hero__bg"></div>
  <canvas class="hero__dots" id="heroDots" aria-hidden="true"></canvas>
  <div class="hero__overlay" aria-hidden="true"></div>
  <div class="hero__particles" aria-hidden="true">
    <span class="particle"></span><span class="particle"></span>
    <span class="particle"></span><span class="particle"></span>
  </div>
  <div class="hero__content">
    <span class="hero__eyebrow">Acme Corp &middot; Annual Report</span>
    <h1 class="hero-title">A year of<br><span class="highlight">remarkable</span><br>progress</h1>
    <p class="hero__tagline">FY 2024 &middot; Building the future, together</p>
    <div class="hero__divider"></div>
    <div class="hero__prose">
      <p>This year we pushed boundaries across every dimension of our business &mdash; from product innovation to customer experience to operational excellence.</p>
      <p>Here is what we achieved, and what it means for the road ahead.</p>
    </div>
  </div>
  <div class="hero__scroll-cue" aria-hidden="true">
    <span>Scroll</span>
    <span class="scroll-line"></span>
  </div>
</section>

<!-- Strategic pillars: dark section, 4-column grid, SVG icons animate stroke-draw then fill on scroll -->
<section class="priorities-overview" id="pillars">
  <h2 class="priorities-overview__title">Four Pillars of Progress</h2>
  <div class="priorities-grid">
    <a href="#innovation" class="priority-item">
      <div class="priority-item__icon-wrap">
        <svg class="pri-svg" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M40 12C28 12 18 22 18 34c0 8 4 15 11 19v5c0 2 2 4 4 4h14c2 0 4-2 4-4v-5c7-4 11-11 11-19C62 22 52 12 40 12zM33 66h14c0 2-2 4-4 4h-6c-2 0-4-2-4-4zM40 20v8M32 24l4 4M48 24l-4 4"/>
        </svg>
      </div>
      <div class="priority-item__title">Innovation</div>
      <div class="priority-item__desc">Platforms, products &amp; new capabilities</div>
    </a>
    <a href="#customers" class="priority-item">
      <div class="priority-item__icon-wrap">
        <svg class="pri-svg" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M40 22s-12-8-18 2c-4 7 2 14 18 26 16-12 22-19 18-26-6-10-18-2-18-2zM28 56s-8 4-12 10h48c-4-6-12-10-12-10M28 56s2-4 12-4 12 4 12 4"/>
        </svg>
      </div>
      <div class="priority-item__title">Customer Success</div>
      <div class="priority-item__desc">Deeper relationships &amp; record NPS</div>
    </a>
    <a href="#operations" class="priority-item">
      <div class="priority-item__icon-wrap">
        <svg class="pri-svg" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M40 28c-7 0-12 5-12 12s5 12 12 12 12-5 12-12-5-12-12-12zM40 16v6M40 58v6M16 40h6M58 40h6M22 22l4 4M54 54l4 4M58 22l-4 4M26 54l-4 4"/>
        </svg>
      </div>
      <div class="priority-item__title">Operations</div>
      <div class="priority-item__desc">Efficiency, reliability &amp; scale</div>
    </a>
    <a href="#ahead" class="priority-item">
      <div class="priority-item__icon-wrap">
        <svg class="pri-svg" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M40 12s16 2 20 24v20l-8-8-12 4-12-4-8 8V36c4-22 20-24 20-24zM33 62s2 6 7 6 7-6 7-6V54H33zM36 32c0-2 2-4 4-4s4 2 4 4-2 4-4 4-4-2-4-4z"/>
        </svg>
      </div>
      <div class="priority-item__title">Looking Ahead</div>
      <div class="priority-item__desc">Strategy, vision &amp; FY25 goals</div>
    </a>
  </div>
</section>

<!-- Innovation: light section, two-col text + inline SVG visual, stats row, impact cards, emphasis block -->
<section class="section section--light" id="innovation">
  <div class="section-marker" aria-hidden="true">01</div>
  <div class="container">
    <div class="two-col">
      <div class="reveal--left">
        <span class="pillar-badge">Innovation</span>
        <h2>Building Products<br>That Shape Tomorrow</h2>
        <p class="lead">FY 2024 was our most ambitious product year yet. We launched three major platforms and set new performance benchmarks across every metric.</p>
        <div class="content-block">
          <h3>Platform Modernization</h3>
          <p>We rebuilt our core infrastructure from the ground up, delivering <strong>10&times; faster load times</strong>, a unified API surface, and continuous delivery pipelines that ship multiple times per day.</p>
          <ul>
            <li>Universal mobile-web architecture &mdash; 40% engineering savings</li>
            <li>OTA updates cut hotfix time from 24 hours to 2 hours</li>
            <li>Zero-downtime deployments across 6 global regions</li>
          </ul>
        </div>
      </div>
      <div>
        <div class="two-col__media reveal--right">
          <svg viewBox="0 0 480 360" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%">
            <defs>
              <radialGradient id="rg1" cx="55%" cy="40%" r="55%">
                <stop offset="0%" stop-color="rgba(37,99,235,.25)"/>
                <stop offset="100%" stop-color="transparent"/>
              </radialGradient>
            </defs>
            <rect width="480" height="360" fill="#0a1628"/>
            <rect width="480" height="360" fill="url(#rg1)"/>
            <rect x="40" y="60" width="180" height="10" rx="5" fill="rgba(255,255,255,.25)"/>
            <rect x="40" y="78" width="120" height="7" rx="3.5" fill="rgba(255,255,255,.12)"/>
            <rect x="40" y="110" width="400" height="180" rx="14" fill="rgba(255,255,255,.04)" stroke="rgba(16,185,129,.3)" stroke-width="1"/>
            <rect x="56" y="130" width="100" height="10" rx="5" fill="rgba(16,185,129,.6)"/>
            <rect x="56" y="150" width="280" height="6" rx="3" fill="rgba(255,255,255,.15)"/>
            <rect x="56" y="164" width="240" height="6" rx="3" fill="rgba(255,255,255,.1)"/>
            <rect x="56" y="178" width="260" height="6" rx="3" fill="rgba(255,255,255,.12)"/>
            <circle cx="380" cy="200" r="44" fill="none" stroke="rgba(16,185,129,.3)" stroke-width="2"/>
            <circle cx="380" cy="200" r="30" fill="rgba(16,185,129,.15)"/>
            <text x="380" y="207" text-anchor="middle" font-size="18" font-weight="700" fill="rgba(16,185,129,.95)" font-family="system-ui">10x</text>
            <text x="240" y="320" text-anchor="middle" font-size="11" font-weight="500" fill="rgba(255,255,255,.4)" letter-spacing="2" font-family="system-ui">PLATFORM PERFORMANCE</text>
          </svg>
        </div>
        <!-- Stats row: each .stat-inline__number wraps a .stat-counter with data-target, data-suffix, data-format -->
        <div class="stats-row reveal" style="margin-top:var(--space-lg)">
          <div class="stat-inline">
            <div class="stat-inline__number"><span class="stat-counter" data-target="10" data-suffix="x" data-format="none">0</span></div>
            <div class="stat-inline__label">Faster Load Times</div>
          </div>
          <div class="stat-inline">
            <div class="stat-inline__number"><span class="stat-counter" data-target="40" data-suffix="%" data-format="none">0</span></div>
            <div class="stat-inline__label">Eng. Cost Savings</div>
          </div>
          <div class="stat-inline">
            <div class="stat-inline__number"><span class="stat-counter" data-target="3" data-format="none">0</span></div>
            <div class="stat-inline__label">New Platforms</div>
          </div>
        </div>
      </div>
    </div>
    <div class="content-block reveal">
      <h3>AI &amp; Automation</h3>
      <p>We embedded AI across the product suite &mdash; intelligent search, personalized recommendations, automated reporting, and smart workflows. Our AI features now handle <strong>2.3M+ daily interactions</strong> with 94% accuracy, saving teams an average of 6 hours per week.</p>
    </div>
    <!-- Impact cards: .impact-card with __stat, __label, __desc. Add reveal--stagger to the grid for staggered entrance -->
    <div class="impact-cards reveal--stagger">
      <div class="impact-card">
        <div class="impact-card__stat"><span class="stat-counter" data-target="2.3" data-suffix="M+" data-format="decimal">0</span></div>
        <div class="impact-card__label">Daily AI Interactions</div>
        <div class="impact-card__desc">Across search, recommendations &amp; automated workflows</div>
      </div>
      <div class="impact-card">
        <div class="impact-card__stat">94%</div>
        <div class="impact-card__label">Accuracy Rate</div>
        <div class="impact-card__desc">Best-in-class AI performance, up from 78% last year</div>
      </div>
      <div class="impact-card">
        <div class="impact-card__stat">6 <span style="font-size:.6em;font-weight:400">hrs/wk</span></div>
        <div class="impact-card__label">Time Saved per Team</div>
        <div class="impact-card__desc">Automation eliminating high-volume manual work</div>
      </div>
    </div>
    <div class="emphasis-block reveal">
      <p>FY 2024 proved that <em>intelligent automation and a modern platform foundation</em> are not just technical achievements &mdash; they are the engine driving every business outcome this year.</p>
    </div>
  </div>
</section>

<!-- Customer Success: dark section, two-col (reversed), editorial pull quote, progress rings, impact cards -->
<section class="section section--dark" id="customers">
  <div class="section-marker" aria-hidden="true">02</div>
  <div class="container">
    <div class="two-col two-col--reverse">
      <div class="reveal--right">
        <span class="pillar-badge">Customer Success</span>
        <h2>Stronger Relationships,<br>Measurable Results</h2>
        <p class="lead">Customer satisfaction reached an all-time high as we invested in proactive support, self-service tools, and personalized experiences at scale.</p>
        <div class="content-block">
          <h3>Self-Service &amp; AI Support</h3>
          <p>Our new self-service portal reduced ticket volume by <strong>38%</strong> while maintaining satisfaction above 90%. AI-powered chat handles 67% of tier-1 inquiries instantly, 24/7, in 12 languages.</p>
        </div>
      </div>
      <div>
        <div class="two-col__media reveal--left">
          <!-- NPS gauge visualization -->
          <svg viewBox="0 0 480 340" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%">
            <defs>
              <radialGradient id="rg2" cx="50%" cy="40%" r="55%">
                <stop offset="0%" stop-color="rgba(37,99,235,.2)"/><stop offset="100%" stop-color="transparent"/>
              </radialGradient>
            </defs>
            <rect width="480" height="340" fill="#0a1628"/>
            <rect width="480" height="340" fill="url(#rg2)"/>
            <path d="M 80 280 A 160 160 0 0 1 400 280" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="24" stroke-linecap="round"/>
            <path d="M 80 280 A 160 160 0 0 1 357 148" fill="none" stroke="rgba(16,185,129,.8)" stroke-width="24" stroke-linecap="round"/>
            <text x="240" y="234" text-anchor="middle" font-size="64" font-weight="300" fill="white" font-family="system-ui">72</text>
            <text x="240" y="262" text-anchor="middle" font-size="11" font-weight="600" fill="rgba(255,255,255,.5)" letter-spacing="3" font-family="system-ui">NPS SCORE</text>
          </svg>
        </div>
        <!-- Progress rings: data-percent drives the fill; data-direction="shrink" starts full and contracts (for reductions) -->
        <div class="stats-row reveal" style="margin-top:var(--space-lg)">
          <div class="progress-stat">
            <svg class="progress-ring" viewBox="0 0 120 120" role="img" aria-label="38% ticket reduction">
              <circle class="progress-ring__circle progress-ring__bg" cx="60" cy="60" r="52"/>
              <circle class="progress-ring__circle progress-ring__progress" cx="60" cy="60" r="52" data-percent="38" data-direction="shrink"/>
              <text class="progress-ring__text" x="60" y="68" text-anchor="middle">38%</text>
            </svg>
            <div class="progress-stat__label">Ticket Reduction</div>
          </div>
          <div class="progress-stat">
            <svg class="progress-ring" viewBox="0 0 120 120" role="img" aria-label="67% self-service rate">
              <circle class="progress-ring__circle progress-ring__bg" cx="60" cy="60" r="52"/>
              <circle class="progress-ring__circle progress-ring__progress" cx="60" cy="60" r="52" data-percent="67"/>
              <text class="progress-ring__text" x="60" y="68" text-anchor="middle">67%</text>
            </svg>
            <div class="progress-stat__label">Self-Service Rate</div>
          </div>
          <div class="progress-stat">
            <svg class="progress-ring" viewBox="0 0 120 120" role="img" aria-label="NPS 72">
              <circle class="progress-ring__circle progress-ring__bg" cx="60" cy="60" r="52"/>
              <circle class="progress-ring__circle progress-ring__progress" cx="60" cy="60" r="52" data-percent="72"/>
              <text class="progress-ring__text" x="60" y="68" text-anchor="middle">NPS 72</text>
            </svg>
            <div class="progress-stat__label">Customer NPS</div>
          </div>
        </div>
      </div>
    </div>
    <!-- Editorial pull quote: decorative oversized quotation mark, large light-weight text -->
    <div class="editorial-quote reveal">
      <div class="editorial-quote__mark" aria-hidden="true">&ldquo;</div>
      <p class="editorial-quote__text">The team transformed how we experience the product. Response times that used to take hours now take seconds.</p>
    </div>
    <div class="content-block reveal">
      <h3>Customer Growth</h3>
      <p>We grew our customer base by <strong>34%</strong> year-over-year, reaching 1.2M active accounts. Churn dropped to an all-time low of 4.2%, and expansion revenue from existing customers grew 28%. Enterprise accounts now represent 52% of total ARR.</p>
    </div>
    <div class="impact-cards reveal--stagger">
      <div class="impact-card">
        <div class="impact-card__stat"><span class="stat-counter" data-target="1.2" data-suffix="M" data-format="decimal">0</span></div>
        <div class="impact-card__label">Active Accounts</div>
        <div class="impact-card__desc">34% YoY growth &mdash; all-time high</div>
      </div>
      <div class="impact-card">
        <!-- data-from + data-direction="down" animates the counter decreasing from a higher starting value -->
        <div class="impact-card__stat"><span class="stat-counter" data-target="4.2" data-suffix="%" data-from="8.1" data-direction="down" data-format="decimal">8.1%</span></div>
        <div class="impact-card__label">Annual Churn Rate</div>
        <div class="impact-card__desc">Down from 8.1% &mdash; best in company history</div>
      </div>
      <div class="impact-card">
        <div class="impact-card__stat"><span class="stat-counter" data-target="28" data-suffix="%" data-format="none">0</span></div>
        <div class="impact-card__label">Expansion Revenue</div>
        <div class="impact-card__desc">Existing customers growing alongside us</div>
      </div>
    </div>
  </div>
</section>

<!-- Operations: gray section, centered text, stats row, section-viz (full-bleed animated SVG chart), impact cards -->
<section class="section section--gray" id="operations">
  <div class="section-marker" aria-hidden="true">03</div>
  <div class="container">
    <div class="centered-text reveal">
      <span class="pillar-badge">Operations</span>
      <h2>World-Class Reliability<br>&amp; Engineering Excellence</h2>
      <p class="lead">Record uptime, slashed incident response times, and 5&times; peak load capacity &mdash; all while reducing infrastructure costs by 30%.</p>
    </div>
    <div class="stats-row reveal" style="justify-content:center">
      <div class="stat-inline">
        <div class="stat-inline__number"><span class="stat-counter" data-target="99.97" data-suffix="%" data-format="decimal">0%</span></div>
        <div class="stat-inline__label">Platform Uptime</div>
      </div>
      <div class="stat-inline">
        <div class="stat-inline__number"><span class="stat-counter" data-target="30" data-suffix="%" data-format="none">0</span></div>
        <div class="stat-inline__label">Infra Cost Reduction</div>
      </div>
      <div class="stat-inline">
        <div class="stat-inline__number"><span class="stat-counter" data-target="5" data-suffix="x" data-format="none">0</span></div>
        <div class="stat-inline__label">Peak Load Capacity</div>
      </div>
      <div class="stat-inline">
        <div class="stat-inline__number"><span class="stat-counter" data-target="82" data-suffix="%" data-format="none">0</span></div>
        <div class="stat-inline__label">Faster MTTR</div>
      </div>
    </div>
    <!-- Section viz: full-bleed animated SVG. Escapes container by using negative margins + 100vw width. -->
    <div class="section-viz reveal" style="background:var(--navy);border-radius:var(--radius-lg);overflow:hidden" aria-label="Quarterly performance chart">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 220">
        <style>
          @keyframes yr-bar{from{transform:scaleY(0);transform-origin:bottom}to{transform:scaleY(1);transform-origin:bottom}}
          @keyframes yr-line{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
          @keyframes yr-dot{from{r:0}to{r:5}}
        </style>
        <text x="450" y="28" text-anchor="middle" font-family="system-ui" font-size="10" font-weight="600" fill="white" opacity=".4" letter-spacing="3">QUARTERLY PERFORMANCE</text>
        <rect x="140" y="96" width="60" height="84" rx="4" fill="rgba(37,99,235,.5)" style="animation:yr-bar 1s .2s ease both"/>
        <rect x="260" y="68" width="60" height="112" rx="4" fill="rgba(37,99,235,.55)" style="animation:yr-bar 1s .4s ease both"/>
        <rect x="380" y="44" width="60" height="136" rx="4" fill="rgba(16,185,129,.7)" style="animation:yr-bar 1s .6s ease both"/>
        <rect x="500" y="28" width="60" height="152" rx="4" fill="rgba(16,185,129,.85)" style="animation:yr-bar 1s .8s ease both"/>
        <polyline points="170,140 290,112 410,76 530,52" fill="none" stroke="rgba(245,158,11,.8)" stroke-width="2" stroke-dasharray="1000" stroke-dashoffset="1000" stroke-linecap="round" style="animation:yr-line 2s 1s ease forwards"/>
        <circle cx="170" cy="140" r="0" fill="#f59e0b" style="animation:yr-dot .3s 2.6s ease forwards"/>
        <circle cx="290" cy="112" r="0" fill="#f59e0b" style="animation:yr-dot .3s 2.8s ease forwards"/>
        <circle cx="410" cy="76" r="0" fill="#f59e0b" style="animation:yr-dot .3s 3s ease forwards"/>
        <circle cx="530" cy="52" r="0" fill="#f59e0b" style="animation:yr-dot .3s 3.2s ease forwards"/>
        <text x="170" y="200" text-anchor="middle" font-family="system-ui" font-size="10" fill="rgba(255,255,255,.5)">Q1</text>
        <text x="290" y="200" text-anchor="middle" font-family="system-ui" font-size="10" fill="rgba(255,255,255,.5)">Q2</text>
        <text x="410" y="200" text-anchor="middle" font-family="system-ui" font-size="10" fill="rgba(16,185,129,.9)">Q3</text>
        <text x="530" y="200" text-anchor="middle" font-family="system-ui" font-size="10" fill="rgba(16,185,129,.9)">Q4</text>
        <rect x="660" y="78" width="10" height="10" rx="2" fill="rgba(37,99,235,.6)"/>
        <text x="678" y="88" font-family="system-ui" font-size="9" fill="rgba(255,255,255,.5)">Target</text>
        <rect x="660" y="98" width="10" height="10" rx="2" fill="rgba(16,185,129,.8)"/>
        <text x="678" y="108" font-family="system-ui" font-size="9" fill="rgba(255,255,255,.5)">Actual</text>
        <line x1="660" y1="123" x2="670" y2="123" stroke="#f59e0b" stroke-width="2"/>
        <text x="678" y="127" font-family="system-ui" font-size="9" fill="rgba(255,255,255,.5)">Trend</text>
      </svg>
    </div>
    <div class="content-block reveal">
      <h3>Security &amp; Compliance</h3>
      <p>We achieved SOC 2 Type II, ISO 27001, and GDPR compliance, completed 100% of security audit remediations on schedule, and reduced mean time to detect threats by 65%. Our security posture is now in the top quartile for our industry segment.</p>
    </div>
    <!-- Asymmetric card grid: first card is 1.5x wide, useful for a featured metric with a progress ring -->
    <div class="impact-cards impact-cards--asymmetric reveal--stagger">
      <div class="impact-card">
        <svg class="progress-ring" viewBox="0 0 120 120" role="img" aria-label="100% compliance">
          <circle class="progress-ring__circle progress-ring__bg" cx="60" cy="60" r="52"/>
          <circle class="progress-ring__circle progress-ring__progress" cx="60" cy="60" r="52" data-percent="100"/>
          <text class="progress-ring__text" x="60" y="68" text-anchor="middle">100%</text>
        </svg>
        <div class="impact-card__label">Compliance Rate</div>
        <div class="impact-card__desc">SOC 2 Type II, ISO 27001 &amp; GDPR &mdash; all on schedule</div>
      </div>
      <div class="impact-card">
        <div class="impact-card__stat"><span class="stat-counter" data-target="65" data-suffix="%" data-format="none">0</span></div>
        <div class="impact-card__label">Faster Threat Detection</div>
        <div class="impact-card__desc">MTTD reduced from 4h to 84 minutes</div>
      </div>
      <div class="impact-card">
        <div class="impact-card__stat"><span class="stat-counter" data-target="1200" data-suffix="+" data-format="comma">0</span></div>
        <div class="impact-card__label">CVEs Resolved</div>
        <div class="impact-card__desc">Comprehensive vulnerability remediation</div>
      </div>
    </div>
  </div>
</section>

<!-- Closing: deep navy, concentric ring graphic fading into background, centered tagline + back-to-top -->
<section class="closing section--deep" id="ahead">
  <div class="closing__visual">
    <div class="closing__visual-inner">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0" aria-hidden="true">
        <defs>
          <radialGradient id="closingGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(16,185,129,.2)"/>
            <stop offset="100%" stop-color="transparent"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#closingGlow)"/>
        <circle cx="50%" cy="50%" r="150" fill="none" stroke="rgba(16,185,129,.06)" stroke-width="1"/>
        <circle cx="50%" cy="50%" r="220" fill="none" stroke="rgba(37,99,235,.04)" stroke-width="1"/>
        <circle cx="50%" cy="50%" r="310" fill="none" stroke="rgba(255,255,255,.025)" stroke-width="1"/>
      </svg>
    </div>
  </div>
  <div class="closing__text reveal">
    <div class="closing__divider"></div>
    <p class="closing__tagline">Looking forward to<br><strong>an even bigger 2025</strong></p>
    <div class="closing__divider"></div>
    <p class="closing__body">The foundation we built this year &mdash; the platforms, the processes, the people &mdash; positions us to move faster and create more value than ever before.</p>
    <p class="closing__body"><strong>Thank you to every teammate, customer, and partner</strong> who made FY 2024 our best year yet.</p>
    <button class="back-to-top" onclick="window.scrollTo({top:0,behavior:'smooth'})">
      <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
      Back to top
    </button>
  </div>
</section>

<script>
(function() {
  var rm = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  // Sticky nav + scroll progress bar + active section highlight
  var nav = document.getElementById('stickyNav');
  var prog = document.getElementById('scrollProgress');
  function updateScroll() {
    if (prog) {
      var docH = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.width = (docH > 0 ? window.scrollY / docH * 100 : 0) + '%';
    }
    if (nav) nav.classList.toggle('visible', window.scrollY > window.innerHeight * 0.7);
    var links = document.querySelectorAll('.sticky-nav__link[data-section]');
    var sections = Array.from(document.querySelectorAll('section[id]'));
    var cur = '';
    sections.forEach(function(s) { if (window.scrollY >= s.offsetTop - 120) cur = s.id; });
    links.forEach(function(l) { l.classList.toggle('active', l.getAttribute('data-section') === cur); });
  }
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('resize', updateScroll, { passive: true });

  // IntersectionObserver reveal animations (.reveal, .reveal--left, .reveal--right, .reveal--stagger)
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function(es) {
      es.forEach(function(e) { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal,.reveal--left,.reveal--right,.reveal--stagger,.photo-item,.two-col__media,.priorities-overview').forEach(function(el) { obs.observe(el); });
  } else {
    document.querySelectorAll('.reveal,.reveal--left,.reveal--right,.reveal--stagger,.photo-item,.two-col__media,.priorities-overview').forEach(function(el) { el.classList.add('visible'); });
  }

  // Animated stat counters — triggered once on scroll into view
  // data-target: final value | data-suffix: unit | data-format: none/comma/decimal
  // data-from + data-direction="down": count from a higher start value downward
  var cObs = new IntersectionObserver(function(es) {
    es.forEach(function(e) {
      if (e.isIntersecting && !e.target._anim) { e.target._anim = true; animCounter(e.target); cObs.unobserve(e.target); }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.stat-counter').forEach(function(el) { cObs.observe(el); });
  function animCounter(el) {
    var tgt = parseFloat(el.getAttribute('data-target'));
    var sfx = el.getAttribute('data-suffix') || '';
    var fmt = el.getAttribute('data-format') || 'none';
    var dir = el.getAttribute('data-direction') || 'up';
    var fa = el.getAttribute('data-from');
    var rng = Math.abs(tgt - (fa != null ? parseFloat(fa) : 0));
    var dur = rm ? 0 : (rng >= 1000 ? 4500 : rng >= 100 ? 3500 : 3000);
    var sv = fa != null ? parseFloat(fa) : dir === 'down' ? tgt * 2 : 0;
    function fmt2(v) { return fmt === 'comma' ? Math.round(v).toLocaleString() + sfx : fmt === 'decimal' ? v.toFixed(1) + sfx : Math.round(v) + sfx; }
    var t0 = performance.now();
    function step(now) {
      var p = Math.min((now - t0) / (dur || 1), 1);
      var e = p === 1 ? 1 : dir === 'down' ? 1 - Math.pow(1 - p, 3) : 1 - Math.pow(1 - p, 4);
      el.textContent = fmt2(sv + (tgt - sv) * e);
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmt2(tgt);
    }
    el.textContent = fmt2(sv); requestAnimationFrame(step);
  }

  // SVG progress rings — grow (default) or shrink (data-direction="shrink") on scroll into view
  if (!rm) {
    var rObs = new IntersectionObserver(function(es) {
      es.forEach(function(e) {
        if (e.isIntersecting && !e.target._anim) {
          e.target._anim = true;
          var ring = e.target;
          var pct = parseFloat(ring.getAttribute('data-percent'));
          var r = parseFloat(ring.getAttribute('r'));
          var c = 2 * Math.PI * r;
          ring.style.strokeDasharray = c + ' ' + c;
          ring.style.strokeDashoffset = ring.getAttribute('data-direction') === 'shrink' ? 0 : c;
          setTimeout(function() { ring.style.strokeDashoffset = c - (pct / 100 * c); }, 100);
          rObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('.progress-ring__progress').forEach(function(r) { rObs.observe(r); });
  } else {
    document.querySelectorAll('.progress-ring__progress').forEach(function(r) {
      var pct = parseFloat(r.getAttribute('data-percent'));
      var radius = parseFloat(r.getAttribute('r'));
      var c = 2 * Math.PI * radius;
      r.style.strokeDasharray = c + ' ' + c;
      r.style.strokeDashoffset = c - (pct / 100 * c);
    });
  }

  // Magnetic hover effect on cards + stats (subtle follow-cursor displacement)
  if (!rm) {
    function mag(el, s) {
      var rx, cx, cy;
      el.addEventListener('mouseenter', function() { rx = el.getBoundingClientRect(); cx = rx.left + rx.width / 2; cy = rx.top + rx.height / 2; });
      el.addEventListener('mousemove', function(ev) { el.style.transform = 'translate(' + (ev.clientX - cx) * s + 'px,' + (ev.clientY - cy) * s + 'px)'; });
      el.addEventListener('mouseleave', function() { el.style.transform = ''; });
    }
    document.querySelectorAll('.impact-card').forEach(function(c) { mag(c, 0.08); });
    document.querySelectorAll('.stat-inline').forEach(function(c) { mag(c, 0.06); });
  }

  // h2 word-by-word scale animation — wraps each word in a .word span
  document.querySelectorAll('h2').forEach(function(h) {
    h.innerHTML = h.innerHTML.split(/(<br>|<br\/>|<br \/>)/gi).map(function(p) {
      return p.match(/<br>/i) ? p : p.split(' ').filter(Boolean).map(function(w) { return '<span class="word">' + w + '</span>'; }).join(' ');
    }).join('');
  });

  updateScroll();

  // Hero dot-matrix canvas — fills a dark layer, destination-out punches holes revealing the radial gradient beneath
  // Creates an animated halftone effect with focal boost, breathing wave, and radial scan pulse
  (function dotMatrix() {
    var cv = document.getElementById('heroDots');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var GAP = 8, aid = null, t0 = performance.now();
    function size() { var rc = cv.parentElement.getBoundingClientRect(); cv.width = Math.round(rc.width * dpr); cv.height = Math.round(rc.height * dpr); }
    function draw(now) {
      var el = (now - t0) / 1000, w = cv.width, h = cv.height, g = GAP * dpr, mr = g * 0.44;
      var cx = w * 0.65, cy = h * 0.38, md = Math.sqrt(w * w + h * h) * 0.5;
      var mat = 1 - Math.pow(1 - Math.min(el / 2.5, 1), 4);
      var sd = ((el % 7) / 7) * md * 1.8, sw = g * 20;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#060e1a'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#fff';
      for (var y = g * .5; y < h; y += g) {
        for (var x = g * .5; x < w; x += g) {
          var dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy);
          var dm = 1 - Math.pow(1 - Math.max(0, Math.min((el - (dist / md) * 1.4) / 1.6, 1)), 3);
          var ff = Math.max(0, 1 - dist / (md * 0.65));
          var r2 = mr * (1 + 0.85 * ff * ff) * (Math.sin(el * 0.5 - dist * 0.003) * 0.1 + 1) * (Math.abs(dist - sd) < sw ? 1 + 0.2 * (1 - Math.abs(dist - sd) / sw) : 1) * dm * mat;
          if (r2 < 0.2) continue;
          ctx.beginPath(); ctx.arc(x, y, r2, 0, 6.2832); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (window.scrollY < window.innerHeight * 1.5) aid = requestAnimationFrame(draw); else aid = null;
    }
    function start() { size(); t0 = performance.now(); if (aid) cancelAnimationFrame(aid); if (!rm) aid = requestAnimationFrame(draw); }
    window.addEventListener('scroll', function() { if (!aid && !rm && window.scrollY < window.innerHeight * 1.5) aid = requestAnimationFrame(draw); }, { passive: true });
    var rt; window.addEventListener('resize', function() { clearTimeout(rt); rt = setTimeout(start, 200); });
    start();
  })();
})();
</script>
</body>
</html>`,
};

// ── Template collection ──────────────────────────────────────────────

export const TEMPLATES: PageTemplate[] = [
  portfolioTemplate,
  businessTemplate,
  landingTemplate,
  restaurantTemplate,
  personalTemplate,
  creativeTemplate,
  annualReportTemplate,
];

export function getTemplateById(id: string): PageTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}

/** Build a thumbnail SVG preview of a template (abstract color swatches) */
export function templateThumbnailSvg(template: PageTemplate): string {
  const bgMatch   = template.html.match(/--color-bg:\s*([^;]+)/);
  const primMatch = template.html.match(/--color-primary:\s*([^;]+)/);
  const textMatch = template.html.match(/--color-text:\s*([^;]+)/);
  const bg   = bgMatch?.[1].trim()   ?? '#ffffff';
  const prim = primMatch?.[1].trim() ?? '#6366f1';
  const text = textMatch?.[1].trim() ?? '#000000';

  return `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="80" fill="${bg}"/>
    <rect x="0" y="0" width="120" height="12" fill="${prim}" opacity="0.9"/>
    <rect x="10" y="20" width="60" height="6" rx="3" fill="${text}" opacity="0.8"/>
    <rect x="10" y="30" width="40" height="4" rx="2" fill="${text}" opacity="0.4"/>
    <rect x="10" y="42" width="100" height="20" rx="4" fill="${prim}" opacity="0.15"/>
    <rect x="10" y="68" width="100" height="4" rx="2" fill="${text}" opacity="0.2"/>
  </svg>`;
}

// ── Apply template to active page ────────────────────────────────────

function applyTemplateToCurrentPage(template: PageTemplate): void {
  const page = visual.activePage;
  if (!page) return;

  let tab = state.openTabs.find(t => t.path === page.path);
  if (tab) {
    tab.content = template.html;
    tab.dirty = true;
  } else {
    state.openTabs.push({
      path: page.path,
      content: template.html,
      sha: state.fileShas[page.path] ?? '', // Use stored SHA so push doesn't get rejected
      dirty: true,
      language: 'html',
    });
  }

  // Clear blocks — this is a raw HTML template
  page.blocks = [];
  page.dirty = true;
  visual.dirty = true;

  // Cache in SW and re-render
  import('../preview-sw-client').then(({ cacheFileInSW }) => {
    cacheFileInSW(page.path, template.html);
  });
  import('./canvas').then(({ renderCanvas, updateVisualSaveBtn }) => {
    renderCanvas();
    updateVisualSaveBtn();
  });
  import('./pages').then(({ renderPageList }) => renderPageList());
  import('../ui/notifications').then(({ notify }) => {
    notify(`Template "${template.name}" applied!`, 'success');
  });
}

// ── Template Gallery ─────────────────────────────────────────────────

export function initTemplateGallery(): void {
  const grid = document.getElementById('template-grid');
  if (!grid) return;

  grid.innerHTML = TEMPLATES.map(t => `
    <div class="template-card" data-template-id="${t.id}"
      style="cursor:pointer;border:2px solid var(--border);border-radius:8px;overflow:hidden;transition:all .15s"
      onmouseover="this.style.borderColor='#6366f1';this.style.transform='translateY(-2px)'"
      onmouseout="this.style.borderColor='var(--border)';this.style.transform=''">
      <div style="aspect-ratio:16/10;overflow:hidden;background:var(--bg-mid)">${templateThumbnailSvg(t)}</div>
      <div style="padding:8px 10px">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px">${t.emoji} ${escapeHtmlTs(t.name)}</div>
        <div style="font-size:11px;color:var(--text-dim)">${escapeHtmlTs(t.description)}</div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll<HTMLElement>('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      const template = getTemplateById(card.dataset.templateId!);
      if (!template) return;
      applyTemplateToCurrentPage(template);
      document.getElementById('template-gallery-modal')?.classList.add('hidden');
    });
  });
}

export function showTemplateGallery(): void {
  document.getElementById('template-gallery-modal')?.classList.remove('hidden');
}

// ── Setup Wizard ─────────────────────────────────────────────────────

export function showSetupWizard(): void {
  document.getElementById('setup-wizard-modal')?.classList.remove('hidden');

  const browseBtn = document.getElementById('wizard-browse-templates');
  if (browseBtn) {
    browseBtn.onclick = () => {
      document.getElementById('setup-wizard-modal')?.classList.add('hidden');
      showTemplateGallery();
    };
  }
}

// ── Preview as Visitor ───────────────────────────────────────────────

export function initPreviewButton(): void {
  const previewBtn = document.getElementById('vis-preview-btn');
  const overlay = document.getElementById('preview-overlay');
  const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement | null;
  const closeBtn = document.getElementById('preview-close-btn');

  if (!previewBtn || !overlay || !iframe) return;

  let lastBlobUrl: string | null = null;

  previewBtn.addEventListener('click', () => {
    const page = visual.activePage;
    if (!page) return;

    // Revoke previous blob URL to prevent memory leak
    if (lastBlobUrl) { URL.revokeObjectURL(lastBlobUrl); lastBlobUrl = null; }

    let previewUrl: string;
    if (page.blocks.length > 0) {
      const html = generatePageHTML(page, visual.theme, visual.siteName, visual.siteDesc);
      const blob = new Blob([html], { type: 'text/html' });
      previewUrl = URL.createObjectURL(blob);
      lastBlobUrl = previewUrl; // Track for revocation
    } else {
      previewUrl = `/preview/${page.path}?_wb=${Date.now()}`;
    }

    iframe.src = previewUrl;
    overlay.style.display = 'flex';
    // ESC key closes overlay
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlay(); };
    document.addEventListener('keydown', escHandler, { once: true });

    function closeOverlay() {
      if (overlay) overlay.style.display = 'none';
      if (iframe)  iframe.src = 'about:blank';
      if (lastBlobUrl) { URL.revokeObjectURL(lastBlobUrl); lastBlobUrl = null; }
      document.removeEventListener('keydown', escHandler);
    }

    if (closeBtn) {
      // Re-wire close button each open to capture the current escHandler
      closeBtn.onclick = closeOverlay;
    }
  });
}

// ── Mobile Preview Sidebar ───────────────────────────────────────────

let mobilePreviewInterval: ReturnType<typeof setInterval> | null = null;

export function stopMobilePreview(): void {
  if (mobilePreviewInterval) { clearInterval(mobilePreviewInterval); mobilePreviewInterval = null; }
  const mobileIframe = document.getElementById('mobile-preview-iframe') as HTMLIFrameElement | null;
  if (mobileIframe) mobileIframe.src = 'about:blank';
}

export function initMobilePreview(): void {
  // Clear any existing interval
  if (mobilePreviewInterval) clearInterval(mobilePreviewInterval);

  const mobileIframe = document.getElementById('mobile-preview-iframe') as HTMLIFrameElement | null;
  if (!mobileIframe) return;

  function syncMobile(): void {
    const page = visual.activePage;
    if (!page || !mobileIframe) return;

    const targetSrc = `/preview/${page.path}?_wb=${Date.now()}`;

    // Only update if the page path changed (avoid constant reloads)
    const currentPath = mobileIframe.dataset.pagePath;
    if (currentPath !== page.path) {
      mobileIframe.src = targetSrc;
      mobileIframe.dataset.pagePath = page.path;
    }
  }

  // Initial sync
  syncMobile();

  // Periodic sync every 2 seconds
  mobilePreviewInterval = setInterval(syncMobile, 2000);
}
