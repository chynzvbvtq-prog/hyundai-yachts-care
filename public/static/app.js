
/* ===== HYUNDAI YACHT CARE - app.js ===== */
const API = '';

// ===== AUTH =====
const Auth = {
  getToken: () => localStorage.getItem('hy_token'),
  getUser: () => { try { return JSON.parse(localStorage.getItem('hy_user')||'null'); } catch { return null; } },
  setSession: (token, user) => { localStorage.setItem('hy_token', token); localStorage.setItem('hy_user', JSON.stringify(user)); },
  clearSession: () => { localStorage.removeItem('hy_token'); localStorage.removeItem('hy_user'); },
  isLoggedIn: () => !!localStorage.getItem('hy_token'),
  isAdmin: () => { const u = Auth.getUser(); return u && u.role === 'admin'; }
};

// ===== API FETCH =====
async function apiFetch(path, opts={}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(API + path, { headers, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '오류가 발생했습니다.');
  return data;
}

// ===== NAVBAR =====
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  updateAuthNav();
}
function toggleMenu() {
  const menu = document.getElementById('navMenu');
  const ham = document.getElementById('hamburger');
  menu?.classList.toggle('open');
  ham?.classList.toggle('active');
}
function closeMenu() {
  document.getElementById('navMenu')?.classList.remove('open');
  document.getElementById('hamburger')?.classList.remove('active');
}
function updateAuthNav() {
  const authItem = document.getElementById('authNavItem');
  const dashItem = document.getElementById('dashboardNavItem');
  const adminItem = document.getElementById('adminNavItem');
  if (!authItem) return;
  if (Auth.isLoggedIn()) {
    authItem.style.display = 'none';
    if (dashItem) dashItem.style.display = '';
    if (adminItem && Auth.isAdmin()) adminItem.style.display = '';
  } else {
    authItem.style.display = '';
    if (dashItem) dashItem.style.display = 'none';
    if (adminItem) adminItem.style.display = 'none';
  }
}

// ===== SCROLL ANIMATION =====
function initScrollAnimation() {
  const els = document.querySelectorAll('.scroll-animate');
  if (!els.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.12 });
  els.forEach(el => observer.observe(el));
}

// ===== COUNTER ANIMATION =====
function initCounters() {
  const counters = document.querySelectorAll('.stat-number[data-target]');
  if (!counters.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target, target = +el.dataset.target, dur = 1800;
      let start = null;
      const step = (ts) => {
        if (!start) start = ts;
        const prog = Math.min((ts - start) / dur, 1);
        el.textContent = Math.floor(prog * target).toLocaleString();
        if (prog < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => observer.observe(c));
}

// ===== FAQ =====
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

// ===== MODAL =====
function showInquiryModal() {
  document.getElementById('inquiryModal')?.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeInquiryModal(e) {
  if (!e || e.target === e.currentTarget || e.type === 'click') {
    document.getElementById('inquiryModal')?.classList.remove('active');
    document.body.style.overflow = '';
  }
}
function showModal(id) { document.getElementById(id)?.classList.add('active'); document.body.style.overflow='hidden'; }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); document.body.style.overflow=''; }
document.addEventListener('keydown', e => { if (e.key==='Escape') { document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')); document.body.style.overflow=''; } });

// ===== INQUIRY SUBMIT =====
async function submitInquiry(e) {
  e.preventDefault();
  const form = e.target, btn = document.getElementById('inquirySubmit');
  const errEl = document.getElementById('inquiryError');
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  btn.disabled = true; btn.innerHTML = '<span class="loading-spinner"></span> 접수 중...';
  errEl.style.display = 'none';
  try {
    await apiFetch('/api/inquiries', { method:'POST', body: JSON.stringify(body) });
    form.reset();
    closeInquiryModal();
    showToast('문의가 접수되었습니다. 빠른 시일 내에 답변 드리겠습니다.', 'success');
  } catch(err) {
    errEl.textContent = err.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>문의 접수하기</span>';
  }
}

// ===== TOAST =====
function showToast(msg, type='info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(container);
  }
  const colors = { success:'#D1FAE5;color:#065F46', error:'#FEE2E2;color:#991B1B', info:'#DBEAFE;color:#1E40AF', warning:'#FEF3C7;color:#92400E' };
  const toast = document.createElement('div');
  toast.style.cssText = `background:${colors[type]||colors.info};padding:14px 20px;border-radius:8px;font-size:14px;font-weight:500;max-width:360px;box-shadow:0 4px 16px rgba(0,0,0,0.12);animation:fadeUp 0.3s ease;`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ===== FORMAT =====
function formatPrice(n) { return Number(n).toLocaleString('ko-KR') + '원'; }
function formatDate(d) { if (!d) return '-'; return new Date(d).toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' }); }
function formatDateTime(d) { if (!d) return '-'; return new Date(d).toLocaleString('ko-KR', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
const statusLabels = { pending:'대기중', confirmed:'확정됨', in_progress:'진행중', completed:'완료됨', cancelled:'취소됨' };
const payLabels = { unpaid:'미결제', paid:'결제완료', refunded:'환불됨' };
function statusBadge(s) { return `<span class="badge badge-${s}">${statusLabels[s]||s}</span>`; }
function payBadge(s) { return `<span class="badge badge-${s}">${payLabels[s]||s}</span>`; }

// ===== TABS =====
function switchTab(tabId, groupId) {
  const group = document.getElementById(groupId || 'tabGroup');
  if (!group) return;
  group.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  group.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
  document.getElementById(tabId)?.classList.add('active');
}

// ===== LOGOUT =====
function logout() {
  Auth.clearSession();
  showToast('로그아웃 되었습니다.', 'info');
  setTimeout(() => window.location.href = '/', 800);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initScrollAnimation();
  initCounters();
});
