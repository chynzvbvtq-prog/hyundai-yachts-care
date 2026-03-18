/* ================================================
   HYUNDAI YACHT CARE — app.js
   Main interaction module for all pages
   ================================================ */

// ── Auth helpers ──
function getToken() { return localStorage.getItem('yachtToken'); }
function getUser()  { try { return JSON.parse(localStorage.getItem('yachtUser')||'null'); } catch { return null; } }

// ── Nav scroll ──
(function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  const onScroll = () => {
    if (window.scrollY > 50) { nav.classList.add('scrolled'); nav.classList.remove('transparent'); }
    else { nav.classList.remove('scrolled'); nav.classList.add('transparent'); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  // Show/hide auth nav items
  const token = getToken();
  const user  = getUser();
  const navAuth = document.getElementById('navAuth');
  const navUser = document.getElementById('navUser');
  if (token && user) {
    if (navAuth) navAuth.style.display = 'none';
    if (navUser) navUser.style.display = 'block';
  }
})();

// ── Hamburger menu ──
function toggleMenu() {
  document.getElementById('navMenu')?.classList.toggle('open');
  document.getElementById('hamburger')?.classList.toggle('open');
  document.getElementById('menuOverlay')?.classList.toggle('active');
}
function closeMenu() {
  document.getElementById('navMenu')?.classList.remove('open');
  document.getElementById('hamburger')?.classList.remove('open');
  document.getElementById('menuOverlay')?.classList.remove('active');
}

// ── Loading overlay ──
window.addEventListener('load', () => {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    setTimeout(() => overlay.classList.add('hidden'), 400);
  }
});

// ── Scroll animations (fade-up) ──
(function initScrollAnim() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.10 });
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
})();

// ── Hero counter animation ──
(function initCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseInt(el.dataset.count, 10);
      if (!target) return;
      const dur = 1600;
      let start = null;
      const step = (ts) => {
        if (!start) start = ts;
        const prog = Math.min((ts - start) / dur, 1);
        const eased = 1 - Math.pow(1 - prog, 3);
        el.textContent = Math.floor(eased * target).toLocaleString();
        if (prog < 1) requestAnimationFrame(step);
        else el.textContent = target.toLocaleString();
      };
      requestAnimationFrame(step);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => observer.observe(el));
})();

// ── Particles ──
(function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left:${Math.random()*100}%;
      width:${Math.random()*2+1}px;
      height:${Math.random()*2+1}px;
      animation-duration:${Math.random()*12+8}s;
      animation-delay:${Math.random()*8}s;
    `;
    container.appendChild(p);
  }
})();

// ── FAQ accordion ──
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
  if (!isOpen) {
    item.classList.add('open');
    const ans = item.querySelector('.faq-answer');
    if (ans) ans.style.maxHeight = ans.scrollHeight + 'px';
  }
  // Reset others
  document.querySelectorAll('.faq-item:not(.open) .faq-answer').forEach(a => { a.style.maxHeight = '0'; });
}

// ── Calculator ──
function updateCalc() {
  const pkg    = document.getElementById('calcPackage')?.value;
  const length = parseFloat(document.getElementById('calcLength')?.value) || 0;
  const extra  = parseInt(document.getElementById('calcExtra')?.value) || 0;
  const loc    = parseInt(document.getElementById('calcLocation')?.value) || 0;
  const amountEl = document.getElementById('calcAmount');
  if (!amountEl) return;
  if (!pkg) { amountEl.textContent = '패키지 선택 후 확인'; return; }
  const base = { basic: 150000, premium: 380000, signature: 750000 }[pkg] || 0;
  const lengthMult = length > 20 ? Math.max(1, 1 + (length - 20) / 30) : 1;
  const total = Math.round((base * lengthMult) + extra + loc);
  amountEl.textContent = total.toLocaleString() + '원';
}

// ── Inquiry form ──
async function submitInquiry(e) {
  e.preventDefault();
  const btn = document.getElementById('inqSubmitBtn');
  const alertEl = document.getElementById('inquiryAlert');
  alertEl.className = 'alert'; alertEl.style.display = 'none';
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 전송 중...';
  try {
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:    document.getElementById('inqName').value,
        phone:   document.getElementById('inqPhone').value,
        email:   document.getElementById('inqEmail').value,
        subject: (document.getElementById('inqType')?.value || '') + ': ' + document.getElementById('inqSubject').value,
        message: document.getElementById('inqMessage').value
      })
    });
    const data = await res.json();
    if (data.success) {
      alertEl.className = 'alert success show'; alertEl.style.display = 'block';
      alertEl.innerHTML = '<i class="fas fa-check-circle"></i> 문의가 접수되었습니다. 빠른 시일 내에 답변드리겠습니다.';
      document.getElementById('inquiryForm').reset();
      showToast('문의가 접수되었습니다', 'success');
    } else { throw new Error(data.error); }
  } catch(err) {
    alertEl.className = 'alert error show'; alertEl.style.display = 'block';
    alertEl.textContent = err.message || '문의 접수 중 오류가 발생했습니다.';
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> 문의 보내기';
  }
}

// ── Toast ──
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}
