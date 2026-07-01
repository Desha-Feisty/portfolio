const { motion, useInView, AnimatePresence } = window.Motion;
const { useState, useEffect, useRef, useMemo, useSyncExternalStore } = React;
const Lenis = window.Lenis;
const THREE = window.THREE;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Scroll state store — ref-based, no React re-render on every tick */
const scrollStore = {
  progress: 0, scrolled: false,
  listeners: new Set(),
  subscribe(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); },
  emit() { this.listeners.forEach(cb => cb()); },
  update(progress, scrolled) {
    if (this.progress !== progress || this.scrolled !== scrolled) {
      this.progress = progress; this.scrolled = scrolled; this.emit();
    }
  },
};
function useScrollProgress() {
  return useSyncExternalStore(cb => scrollStore.subscribe(cb), () => scrollStore.progress);
}
function useScrolled() {
  return useSyncExternalStore(cb => scrollStore.subscribe(cb), () => scrollStore.scrolled);
}

/* Shared render callback registry — merges Three.js + Lenis into one rAF loop */
const renderCallbacks = [];
let rafStarted = false;
function startSharedRaf() {
  if (rafStarted) return;
  rafStarted = true;
  function raf(time) {
    renderCallbacks.forEach(fn => fn(time));
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
}
function addRenderCallback(fn) {
  renderCallbacks.push(fn);
  if (!rafStarted) startSharedRaf();
  return () => { const idx = renderCallbacks.indexOf(fn); if (idx >= 0) renderCallbacks.splice(idx, 1); };
}

const THEME = {
  bg: '#0A0A0F',
  surface: '#12121A',
  neon: '#00D4FF',
  electric: '#0066FF',
  text: '#F0F4FF',
  textMuted: '#8899B0',
  border: '#1E2A3A',
};

function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const count = 800;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const colorNeon = new THREE.Color(THEME.neon);
    const colorElectric = new THREE.Color(THEME.electric);

    for (let i = 0; i < count; i++) {
      positions[i*3] = (Math.random() - 0.5) * 30;
      positions[i*3+1] = (Math.random() - 0.5) * 20;
      positions[i*3+2] = (Math.random() - 0.5) * 20 - 5;
      const col = Math.random() > 0.5 ? colorElectric : colorNeon;
      colors[i*3] = col.r;
      colors[i*3+1] = col.g;
      colors[i*3+2] = col.b;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const particles = new THREE.Points(geom, mat);
    scene.add(particles);
    camera.position.z = 8;

    const mouse = { x: 0, y: 0 };
    let mouseActive = false;
    let mouseTimer = null;
    let frameCount = 0;

    const handleMouseMove = (e) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2;
      mouseActive = true;
      clearTimeout(mouseTimer);
      mouseTimer = setTimeout(() => { mouseActive = false; }, 2000);
    };
    if (!reducedMotion) document.addEventListener('mousemove', handleMouseMove);

    /* Register with shared rAF instead of own loop */
    const removeCb = addRenderCallback(() => {
      if (document.hidden) return; /* pause when tab is backgrounded */
      frameCount++;
      if (!reducedMotion) {
        const speed = mouseActive ? 1 : 0.3;
        particles.rotation.x += ((mouse.y * 0.02 - particles.rotation.x) * 0.02) * speed;
        particles.rotation.y += ((mouse.x * 0.02 - particles.rotation.y) * 0.02) * speed;
      }
      renderer.render(scene, camera);
    });

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      removeCb();
      document.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      clearTimeout(mouseTimer);
      renderer.dispose();
      geom.dispose();
      mat.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} id="particle-canvas" aria-hidden="true" />;
}

function ScrollProgress() {
  const progress = useScrollProgress();
  return <div className="progress-bar" style={{ transform: `scaleX(${progress})` }} />;
}

/* Scroll-driven section transition — dramatic clip-path/blur/scale reveal between sections */
function useSectionScroll(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (REDUCED_MOTION) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.filter = 'none';
      el.style.clipPath = 'none';
      return;
    }

    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const top = rect.top;
      const bottom = rect.bottom;
      if (rect.height === 0) return;

      const progress = Math.max(0, Math.min(1, 1 - top / vh));
      const exitProgress = Math.max(0, Math.min(1, -top / rect.height));
      const visibility = Math.min(1, progress * (1 - exitProgress * 0.7));

      const scale = 0.85 + visibility * 0.15;
      const translateY = (1 - visibility) * 60;
      const blur = Math.max(0, (1 - visibility) * 2);
      const clipAmount = (1 - visibility) * 100;

      el.style.opacity = visibility;
      el.style.transform = `translateY(${translateY}px) scale(${scale})`;
      el.style.filter = `blur(${blur}px)`;
      el.style.clipPath = `inset(${clipAmount}% 0% 0% 0%)`;
    };

    const onLenisScroll = () => { update(); };
    if (window.lenis) {
      window.lenis.on('scroll', onLenisScroll);
    } else {
      window.addEventListener('scroll', update, { passive: true });
    }

    update();

    return () => {
      if (window.lenis) window.lenis.off('scroll', onLenisScroll);
      window.removeEventListener('scroll', update);
      el.style.willChange = '';
      el.style.filter = '';
      el.style.clipPath = '';
    };
  }, []);
}

/* Lightweight reveal — native IntersectionObserver + CSS transitions (no JS animation per frame) */
function useReveal(options = {}) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        /* Defer one frame so browser paints the hidden state first */
        requestAnimationFrame(() => setVis(true));
        if (options.once !== false) obs.unobserve(el);
      }
    }, { rootMargin: options.margin || '-120px', threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [options.margin, options.once]);
  return [ref, vis];
}

function Reveal({ children, delay = 0, className = '' }) {
  const [ref, vis] = useReveal({ margin: '-80px' });
  return (
    <div
      ref={ref}
      className={`reveal-section ${vis ? 'reveal-visible' : 'reveal-hidden'} ${className}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

function RevealStagger({ children, delay = 0, className = '' }) {
  const [ref, vis] = useReveal({ margin: '-60px', once: true });
  const total = React.Children.count(children);
  return (
    <div
      ref={ref}
      className={className}
      style={{ '--stagger-total': total, '--stagger-base': delay }}
    >
      {React.Children.map(children, (child, i) => (
        <div style={{ '--item-delay': `${delay + i * 0.08}s`, transitionDelay: `${delay + i * 0.08}s` }}
             className={`reveal-item ${vis ? 'reveal-item-visible' : 'reveal-item-hidden'}`}>
          {child}
        </div>
      ))}
    </div>
  );
}

function RevealItem({ children }) {
  const [ref, vis] = useReveal({ once: true, margin: '-40px' });
  return (
    <div ref={ref}
         className={`reveal-item ${vis ? 'reveal-item-visible' : 'reveal-item-hidden'}`}>
      {children}
    </div>
  );
}

function CountUp({ end, duration = 2000, suffix = '', prefix = '' }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const step = Math.ceil(end / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, end, duration]);
  return <span ref={ref}>{prefix}{count}{suffix}</span>;
}

function Typewriter({ text, className = '' }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const chars = useMemo(() => text.split(''), []);

  return (
    <span ref={ref} className={className}>
      {chars.map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
          animate={isInView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
          transition={{ duration: 0.25, delay: i * 0.035, ease: [0.22, 1, 0.36, 1] }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'steps(2)' }}
        className="inline-block ml-0.5 text-neon font-thin"
      >
        _
      </motion.span>
    </span>
  );
}

function Navbar() {
  const scrolled = useScrolled();
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Focus trap + Escape close for mobile menu */
  useEffect(() => {
    if (!mobileOpen) return;
    const menu = document.getElementById('mobile-menu');
    if (!menu) return;
    const focusable = menu.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { setMobileOpen(false); return; }
      if (e.key !== 'Tab' || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    menu.addEventListener('keydown', handleKeyDown);
    return () => menu.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  const links = [
    { label: 'About', href: '#about' },
    { label: 'Skills', href: '#skills' },
    { label: 'Projects', href: '#projects' },
    { label: 'Contact', href: '#contact' },
  ];

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'glass' : 'bg-transparent'}`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#hero" className="flex items-center gap-2" aria-label="Mostafa Abohamar">
          <span className="text-xl md:text-2xl font-bold text-txtprimary tracking-tight">Mostafa Abohamar</span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-txtsecondary hover:text-electric transition-colors duration-300 text-sm font-medium tracking-wide relative group">
              {l.label}
              <span className="absolute -bottom-1 left-0 w-full h-[2px] bg-electric origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100" />
            </a>
          ))}
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-txtprimary p-2" aria-label="Toggle menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? <path d="M6 6L18 18M6 18L18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            id="mobile-menu"
            className="fixed top-16 left-0 right-0 bottom-0 bg-[#0A0A0F]/95 backdrop-blur-lg md:hidden z-40 flex flex-col items-center justify-center gap-8"
          >
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className="text-2xl text-txtsecondary hover:text-electric transition-colors font-medium">
                {l.label}
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

function Hero() {
  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center px-6 pt-16 overflow-hidden">
      <div className="absolute inset-0 gradient-mesh pointer-events-none" />
      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
           <div
              className="w-36 h-36 mx-auto rounded-full overflow-hidden border-2 border-neon/30 logo-glow relative"
              style={{ willChange: 'transform' }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
            <img
              src="logos/logo-express.png"
              alt="Mostafa Abohamar Logo"
              className="w-full h-full object-contain p-2"
            />
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.3 }}
          className="text-neon text-sm font-mono tracking-widest uppercase mb-4"
        >
          Code Is A Passion
        </motion.p>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black mb-6 tracking-tight">
          <Typewriter text="Backend Engineer" />
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 14, delay: 0.6 }}
          className="text-lg md:text-xl text-txtsecondary mb-10 max-w-2xl mx-auto"
        >
          MERN Stack &middot; AI Integration &middot; Real-Time Systems
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 80, damping: 14, delay: 0.9 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a href="#projects" className="px-8 py-3.5 bg-neon text-dark font-semibold rounded-lg hover:neon-glow active:scale-[0.97] transition-all duration-200">
            View My Work
          </a>
          <a href="#contact" className="px-8 py-3.5 border border-neon/40 text-neon font-semibold rounded-lg hover:bg-neon/10 hover:border-neon active:scale-[0.97] transition-all duration-200">
            Contact Me
          </a>
        </motion.div>

      </div>
    </section>
  );
}

function About() {
  const stats = [
    { label: 'Experience', value: 2, suffix: '+ Years' },
    { label: 'Projects', value: 8, suffix: '+' },
    { label: 'Stack', value: 'MERN', suffix: '' },
    { label: 'Focus', value: 'Backend', suffix: '' },
  ];

  return (
    <section className="relative py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <h2 className="text-3xl md:text-5xl font-black text-txtprimary mb-4">
            About Me
          </h2>
          <div className="w-16 h-1 bg-neon rounded-full mb-12" />
        </Reveal>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          <Reveal delay={0.1}>
            <div className="space-y-5 text-txtsecondary leading-relaxed">
              <p className="text-lg">
                Backend developer with hands-on project experience building scalable REST APIs, real-time systems, and AI-integrated backend services using Node.js, TypeScript, Express, and MongoDB.
              </p>
              <p className="text-lg">
                Currently engineering <span className="text-neon font-semibold">EduBox</span>, a full-featured LMS with Socket.IO real-time collaboration, Gemini AI grading, and Swagger-documented APIs.
              </p>
              <p className="text-lg">
                Skilled in JWT/OAuth authentication, Role-Based Access Control, OWASP security principles, Redis caching, and Dockerized CI/CD deployments. Committed to writing secure, production-ready code with strong attention to performance, maintainability, and clean architecture.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.3}>
            <div className="grid grid-cols-2 gap-4">
              {stats.map((s, i) => (
                <div key={i} className="bg-surfaced border border-border rounded-lg p-6 text-center hover:border-neon/40 transition-all duration-300">
                  <div className="text-3xl md:text-4xl font-black text-electric mb-1 leading-tight break-words">
                    {typeof s.value === 'number' ? <CountUp end={s.value} /> : s.value}
                    {s.suffix}
                  </div>
                  <div className="text-xs text-txtsecondary uppercase tracking-widest">{s.label}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Skills() {
  const skillGroups = [
    {
      category: 'Languages',
      items: ['JavaScript', 'TypeScript', 'Python', 'HTML5', 'CSS3'],
    },
    {
      category: 'Frameworks & Libraries',
      items: ['React', 'Vite', 'Node.js', 'Express.js', 'TailwindCSS', 'DaisyUI', 'Zustand', 'Socket.io'],
    },
    {
      category: 'Databases & Caching',
      items: ['MongoDB', 'Redis', 'Mongoose'],
    },
    {
      category: 'Auth & Security',
      items: ['JWT', 'OAuth 2.0', 'RBAC', 'bcrypt', 'Rate Limiting'],
    },
    {
      category: 'APIs & Real-Time',
      items: ['REST API', 'Swagger', 'WebSockets'],
    },
    {
      category: 'DevOps & Tools',
      items: ['Git', 'GitHub', 'VS Code', 'Postman', 'Docker', 'GitHub Actions', 'Nginx'],
    },
  ];

  return (
    <section className="relative py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <h2 className="text-3xl md:text-5xl font-black text-txtprimary mb-4">
            Tech Stack
          </h2>
          <div className="w-16 h-1 bg-neon rounded-full mb-12" />
        </Reveal>

        <div className="space-y-12">
          {skillGroups.map((group, gi) => (
            <Reveal key={gi} delay={gi * 0.1}>
              <div>
                <motion.h3
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
className="text-sm font-mono text-electric tracking-widest uppercase mb-4"
                  >
                    {group.category}
                </motion.h3>
                <RevealStagger>
                  <div className="flex flex-wrap gap-3">
                    {group.items.map((skill) => (
                      <RevealItem key={skill}>
                        <div className="badge flex items-center gap-2 px-4 py-2 bg-surfaced border border-border rounded-lg text-sm text-txtsecondary cursor-default">
                          <span className="font-medium">{skill}</span>
                        </div>
                      </RevealItem>
                    ))}
                  </div>
                </RevealStagger>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Projects() {
  const projects = [
    {
      title: 'EduBox',
      desc: 'Full-stack Learning Management System with AI-powered grading, real-time analytics, and role-based access.',
      bullets: ['Gemini AI auto-grading, configurable on-submit or on-close', 'Redis caching slashed repeated DB load', 'Socket.IO real-time sync across users', 'Swagger-documented API + admin audit dashboard'],
      tags: ['React', 'Express', 'MongoDB', 'TypeScript', 'Socket.io', 'Gemini AI', 'Redis', 'Docker'],
      url: 'https://github.com/Desha-Feisty/Edu_Box',
    },
    {
      title: 'ChatApp',
      desc: 'Real-time messaging platform with instant delivery, media sharing, and persistent cross-session storage.',
      bullets: ['Socket.IO delivers sub-100ms messages', 'JWT-authenticated private routing', 'Cloudinary media upload and hosting', 'Persistent message history across sessions'],
      tags: ['React', 'Socket.io', 'MongoDB', 'Cloudinary', 'JWT'],
      url: 'https://github.com/Desha-Feisty/ChatApp',
    },
    {
      title: 'yelpcamp',
      desc: 'Campground discovery and review platform with interactive maps, image management, and community ratings.',
      bullets: ['Mapbox interactive map with campground pins', 'Cloudinary image upload pipeline', 'JWT authentication + review/rating system', 'Full CRUD for campgrounds & comments'],
      tags: ['Express', 'MongoDB', 'Mapbox', 'Cloudinary', 'JWT'],
      url: 'https://github.com/Desha-Feisty/yelpcamp',
    },
    {
      title: 'AuthApp',
      desc: 'Secure authentication system with cookie-based JWT, email verification, and automated CI/CD deployment.',
      bullets: ['JWT refresh token rotation reduces unauthorized access risk', 'Email verification via Mailtrap + password reset', 'Input sanitization across all auth endpoints', 'Dockerized CI/CD with automated build and release'],
      tags: ['Express', 'MongoDB', 'JWT', 'Mailtrap', 'Docker'],
      url: 'https://github.com/Desha-Feisty/AuthApp',
    },
  ];

  const Card = ({ project, index }) => {
    const cardRef = useRef(null);
    const rectRef = useRef(null);
    const handleMouseEnter = () => {
      const card = cardRef.current;
      if (card) rectRef.current = card.getBoundingClientRect();
    };
    const handleMouseMove = (e) => {
      const card = cardRef.current;
      if (!card) return;
      const rect = rectRef.current || card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotY = ((x - centerX) / centerX) * 8;
      const rotX = -((y - centerY) / centerY) * 8;
      card.style.setProperty('--rotY', `${rotY}deg`);
      card.style.setProperty('--rotX', `${rotX}deg`);
    };
    const handleMouseLeave = () => {
      const card = cardRef.current;
      if (!card) return;
      card.style.setProperty('--rotY', '0deg');
      card.style.setProperty('--rotX', '0deg');
      rectRef.current = null;
    };

    return (
      <RevealItem>
        <a href={project.url} target="_blank" rel="noopener noreferrer">
          <div
            ref={cardRef}
            onMouseEnter={handleMouseEnter}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="card-tilt bg-surfaced border border-border rounded-lg p-6 h-full hover:border-neon/40 transition-all duration-300 group cursor-pointer"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-txtprimary group-hover:text-electric transition-colors">{project.title}</h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                </svg>
              </div>
              <p className="text-txtsecondary text-sm leading-relaxed mb-3">{project.desc}</p>
              {project.bullets && (
                <ul className="space-y-1.5 mb-5">
                  {project.bullets.map((b, i) => (
                    <li key={i} className="text-xs text-txtsecondary flex items-start gap-2">
                      <span className="text-electric mt-0.5 shrink-0" style={{ opacity: 0.7 }}>▸</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <span key={tag} className="text-xs font-mono text-electric/70 bg-electric/5 px-2 py-1 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </a>
      </RevealItem>
    );
  };

  return (
    <section className="relative py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <h2 className="text-3xl md:text-5xl font-black text-txtprimary mb-4">
            Projects
          </h2>
          <div className="w-16 h-1 bg-neon rounded-full mb-12" />
        </Reveal>

        <RevealStagger delay={0.1}>
          <div className="grid md:grid-cols-2 gap-6 tilt-wrap">
            {projects.map((p, i) => <Card key={i} project={p} index={i} />)}
          </div>
        </RevealStagger>
      </div>
    </section>
  );
}

function CoreCompetencies() {
  const competencies = [
    {
      icon: '01',
      title: 'Resilient Architecture',
      text: 'Improved system resilience under load by designing CRUD systems with secure input handling, Role-Based Access Control, and rate limiting across all endpoints.',
    },
    {
      icon: '02',
      title: 'Session Security',
      text: 'Strengthened session security by implementing JWT authentication with cookies, PEM key handling, refresh tokens, and OAuth 2.0 flows.',
    },
    {
      icon: '03',
      title: 'Deployment Automation',
      text: 'Increased deployment consistency by developing type-safe backend logic for MERN/TypeScript applications and automating builds with Docker.',
    },
    {
      icon: '04',
      title: 'Media & Storage',
      text: 'Enabled scalable, validated media handling by building secure file upload workflows integrated with cloud storage services.',
    },
  ];

  return (
    <section className="relative py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <h2 className="text-3xl md:text-5xl font-black text-txtprimary mb-4">
            Core Competencies
          </h2>
          <div className="w-16 h-1 bg-neon rounded-full mb-12" />
        </Reveal>

        <RevealStagger delay={0.1}>
          <div className="grid md:grid-cols-2 gap-6 tilt-wrap">
            {competencies.map((c, i) => (
              <RevealItem key={i}>
                <div className="bg-surfaced border border-border rounded-lg p-8 hover:border-electric/30 transition-all duration-300 hover:-translate-y-1 h-full flex flex-col">
                  <div className="text-xs font-mono text-neon/50 tracking-widest mb-3">{c.icon}</div>
                  <h3 className="text-xl font-bold text-txtprimary mb-3">{c.title}</h3>
                  <p className="text-txtsecondary leading-relaxed">{c.text}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </RevealStagger>
      </div>
    </section>
  );
}

function Contact() {
  const [formState, setFormState] = useState({ name: '', email: '', message: '' });
  const [toast, setToast] = useState({ show: false, type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const toastTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  const handleChange = (e) => setFormState({ ...formState, [e.target.name]: e.target.value });

  /* FORMSPREE: create a free form at https://formspree.io, then paste your
     form ID below (the "f/..." part from the endpoint URL). */
  const FORMSPREE_ID = 'xwvdrpnk';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formState.name || !formState.email || !formState.message) {
      setToast({ show: true, type: 'error', text: 'All fields are required.' });
      clearTimeout(toastTimerRef.current); toastTimerRef.current = setTimeout(() => setToast({ show: false, type: '', text: '' }), 3000);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState),
      });
      if (!res.ok) throw new Error('Server responded with ' + res.status);
      setToast({ show: true, type: 'success', text: 'Message sent! I\'ll get back to you soon.' });
      setFormState({ name: '', email: '', message: '' });
      clearTimeout(toastTimerRef.current); toastTimerRef.current = setTimeout(() => setToast({ show: false, type: '', text: '' }), 4000);
    } catch {
      setToast({ show: true, type: 'error', text: 'Could not send. Try emailing me directly at deshafeisty@gmail.com' });
      clearTimeout(toastTimerRef.current); toastTimerRef.current = setTimeout(() => setToast({ show: false, type: '', text: '' }), 5000);
    } finally {
      setSubmitting(false);
    }
  };

  const socials = [
    { label: 'GitHub', url: 'https://github.com/Desha-Feisty', icon: 'M' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/mostafa-abohamar-aa135936a/', icon: 'in' },
    { label: 'Email', url: 'mailto:deshafeisty@gmail.com', icon: '@' },
  ];

  const SocialIcon = ({ label }) => {
    if (label === 'GitHub') return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
    );
    if (label === 'LinkedIn') return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
    );
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
    );
  };

  return (
    <section className="relative py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <h2 className="text-3xl md:text-5xl font-black text-txtprimary mb-4">
            Get In Touch
          </h2>
          <div className="w-16 h-1 bg-neon rounded-full mb-12" />
        </Reveal>

        <div className="grid md:grid-cols-2 gap-12">
          <Reveal delay={0.1}>
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {['name', 'email', 'message'].map((field) => (
                <div key={field} className="relative">
                  <label
                    htmlFor={field}
                    className={`absolute left-4 transition-all duration-300 pointer-events-none ${
focusedField === field || formState[field]
                      ? '-top-2.5 text-xs text-electric bg-dark px-1'
                        : 'top-3.5 text-sm text-txtsecondary'
                    }`}
                  >
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                  </label>
                  {field === 'message' ? (
                    <textarea
                      id={field}
                      name={field}
                      value={formState[field]}
                      onChange={handleChange}
                      onFocus={() => setFocusedField(field)}
                      onBlur={() => setFocusedField(null)}
                      rows={4}
                      className="w-full bg-transparent border border-border rounded-lg px-4 pt-4 pb-3 text-txtprimary outline-none transition-all duration-300 focus:border-electric focus:shadow-[0_0_12px_rgba(0,102,255,0.15)] resize-none"
                    />
                  ) : (
                    <input
                      id={field}
                      name={field}
                      type={field === 'email' ? 'email' : 'text'}
                      autoComplete={field === 'email' ? 'email' : field === 'name' ? 'name' : 'off'}
                      value={formState[field]}
                      onChange={handleChange}
                      onFocus={() => setFocusedField(field)}
                      onBlur={() => setFocusedField(null)}
                      className="w-full bg-transparent border border-border rounded-lg px-4 pt-4 pb-3 text-txtprimary outline-none transition-all duration-300 focus:border-electric focus:shadow-[0_0_12px_rgba(0,102,255,0.15)]"
                    />
                  )}
                </div>
              ))}

              <button
                type="submit"
                disabled={submitting}
                className={`ripple w-full py-3.5 rounded-lg font-semibold transition-all duration-300 ${
                  submitting
                    ? 'bg-neon/50 text-dark cursor-wait'
                    : 'bg-neon text-dark hover:neon-glow'
                }`}
              >
                {submitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </Reveal>

          <Reveal delay={0.3}>
            <div className="flex flex-col justify-center gap-8">
              <div>
                <h3 className="text-lg font-semibold text-txtprimary mb-2">Let's build something together</h3>
                <p className="text-txtsecondary leading-relaxed">
                  Whether it's a full-stack application, a real-time system, or AI integration, I'm always open to discussing new projects and opportunities.
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-5 py-3 border border-border rounded-lg text-txtsecondary hover:text-electric hover:border-electric/40 transition-all duration-300 group"
                    aria-label={s.label}
                  >
                    <span className="w-8 h-8 flex items-center justify-center rounded bg-electric/10 text-electric group-hover:bg-electric/20 group-hover:scale-110 transition-all duration-200">
                      <SocialIcon label={s.label} />
                    </span>
                    <span className="text-sm font-medium">{s.label}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
      <AnimatePresence>
        {toast.show && (
          <motion.div
            key="toast"
            role="alert"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-2xl ${
              toast.type === 'success'
                ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                : 'bg-red-500/20 border border-red-500/50 text-red-400'
            }`}
            style={{ backdropFilter: 'blur(12px)' }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function SectionDivider() {
  const ref = useRef(null);
  const lineRef = useRef(null);
  const glowRef = useRef(null);
  const ringRef = useRef(null);
  useEffect(() => {
    if (REDUCED_MOTION) {
      const line = lineRef.current, glow = glowRef.current, ring = ringRef.current;
      if (line) { line.style.transform = 'scaleX(1)'; line.style.opacity = '1'; }
      if (glow) { glow.style.transform = 'scale(1)'; glow.style.opacity = '1'; }
      if (ring) { ring.style.opacity = '0'; }
      return;
    }
    const line = lineRef.current, glow = glowRef.current, ring = ringRef.current;

    const onLenisScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const centerDist = Math.abs(rect.top + rect.height / 2 - vh / 2) / (vh / 2);
      const visibility = Math.max(0, 1 - centerDist * 1.8);
      if (line) { line.style.transform = `scaleX(${visibility})`; line.style.opacity = visibility; }
      if (glow) { glow.style.transform = `scale(${visibility})`; glow.style.opacity = visibility; }
      /* Ripple ring expands as section passes through center */
      if (ring) { ring.style.transform = `scale(${0.5 + visibility * 1.5})`; ring.style.opacity = visibility * 0.3; }
    };

    if (window.lenis) {
      window.lenis.on('scroll', onLenisScroll);
    } else {
      window.addEventListener('scroll', onLenisScroll, { passive: true });
    }
    onLenisScroll();

    return () => {
      if (window.lenis) {
        window.lenis.off('scroll', onLenisScroll);
      } else {
        window.removeEventListener('scroll', onLenisScroll);
      }
    };
  }, []);
  return (
    <div ref={ref} className="h-20 md:h-24 flex items-center justify-center pointer-events-none relative overflow-hidden">
      <div ref={ringRef} className="absolute w-16 h-16 rounded-full border border-neon/30"
        style={{ transform: 'scale(0.5)', opacity: 0 }} />
      <div ref={lineRef} className="absolute left-[15%] right-[15%] h-px origin-left"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), rgba(0,212,255,0.6), rgba(0,212,255,0.4), transparent)', transform: 'scaleX(0)', opacity: 0 }} />
      <div ref={glowRef} className="w-2.5 h-2.5 rounded-full"
        style={{ background: '#00D4FF', boxShadow: '0 0 16px rgba(0,212,255,0.7), 0 0 40px rgba(0,212,255,0.25), 0 0 80px rgba(0,212,255,0.1)', transform: 'scale(0)', opacity: 0 }} />
    </div>
  );
}

function Footer() {
  const [ref, vis] = useReveal({ once: true, margin: '-60px' });
  return (
    <motion.footer
      ref={ref}
      initial={{ opacity: 0 }}
      animate={vis ? { opacity: 1 } : {}}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative border-t border-border py-8 px-6"
    >
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-neon tracking-tight">MA</span>
          <span className="text-sm text-txtsecondary">&copy; 2026 Mostafa Abohamar</span>
        </div>

        <div className="flex items-center gap-6">
          <a href="https://github.com/Desha-Feisty" target="_blank" rel="noopener noreferrer" className="text-txtsecondary hover:text-electric transition-colors duration-200 text-sm" aria-label="GitHub">GitHub</a>
          <a href="https://www.linkedin.com/in/mostafa-abohamar-aa135936a/" target="_blank" rel="noopener noreferrer" className="text-txtsecondary hover:text-electric transition-colors duration-200 text-sm" aria-label="LinkedIn">LinkedIn</a>
          <a href="mailto:deshafeisty@gmail.com" className="text-txtsecondary hover:text-electric transition-colors duration-200 text-sm" aria-label="Email">Email</a>
        </div>

        <a
          href="#hero"
          className="w-10 h-10 flex items-center justify-center rounded-lg border border-border text-txtsecondary hover:text-electric hover:border-electric/40 active:scale-90 transition-all duration-200"
          aria-label="Back to top"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </a>
      </div>
    </motion.footer>
  );
}

/* React.memo not needed — App has no re-renders to skip */

/* Wraps sections with continuous scroll-driven transition between them */
function SectionWrapper({ children, id, className = '' }) {
  const ref = useRef(null);
  useSectionScroll(ref);
  return (
    <div ref={ref} id={id} className={`section-scroll-wrap ${className}`}>
      {children}
    </div>
  );
}

function App() {
  useEffect(() => {
    if (REDUCED_MOTION) {
      const onScroll = () => {
        const top = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        scrollStore.update(docHeight > 0 ? top / docHeight : 0, top > 50);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    window.lenis = lenis;
    lenis.on('scroll', (e) => {
      scrollStore.update(e.progress, e.scroll > 50);
    });
    const removeCb = addRenderCallback((time) => { lenis.raf(time); });
    return () => { removeCb(); lenis.destroy(); delete window.lenis; };
  }, []);

  return (
    <div id="main-content" className="relative min-h-screen" style={{ background: THEME.bg }}>
      <ParticleBackground />
      <ScrollProgress />
      <Navbar />
      <Hero />
      <SectionWrapper id="about">
        <About />
      </SectionWrapper>
      <SectionDivider />
      <SectionWrapper id="skills">
        <Skills />
      </SectionWrapper>
      <SectionDivider />
      <SectionWrapper id="projects">
        <Projects />
      </SectionWrapper>
      <SectionDivider />
      <SectionWrapper id="competencies">
        <CoreCompetencies />
      </SectionWrapper>
      <SectionDivider />
      <SectionWrapper id="contact">
        <Contact />
      </SectionWrapper>
      <Footer />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
