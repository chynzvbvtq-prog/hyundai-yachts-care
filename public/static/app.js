/* ================================================
   HYUNDAI YACHT CARE — app.js
   Main interaction module for all pages
   ================================================ */

// ── Auth helpers ──
function getToken()        { return localStorage.getItem('yachtToken'); }
function getUser()         { try { return JSON.parse(localStorage.getItem('yachtUser')||'null'); } catch { return null; } }
function getRefreshToken() { return localStorage.getItem('yachtRefreshToken'); }

/**
 * [B-2] 토큰 만료 자동 갱신 (Access Token < 30분 남으면 refresh 시도)
 * 모든 인증 API 호출 전 이 함수를 통해 토큰 상태를 확인합니다.
 */
async function ensureValidToken() {
  const token = getToken();
  if (!token) return null;

  // JWT payload 파싱 (검증 없이 디코드)
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    const nowSec  = Math.floor(Date.now() / 1000);
    const remaining = (payload.exp || 0) - nowSec;

    // 30분(1800초) 이내 만료 예정 → refresh 시도
    if (remaining < 1800) {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        // refresh 토큰도 없으면 로그아웃
        clearAuthAndRedirect();
        return null;
      }
      try {
        const res  = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
        const data = await res.json();
        if (data.success && data.token) {
          localStorage.setItem('yachtToken', data.token);
          return data.token;
        } else {
          // refresh 실패 → 로그아웃
          clearAuthAndRedirect();
          return null;
        }
      } catch { /* 네트워크 오류 시 기존 토큰 계속 사용 */ }
    }
  } catch { /* 파싱 실패 시 기존 토큰 계속 사용 */ }

  return token;
}

function clearAuthAndRedirect() {
  localStorage.removeItem('yachtToken');
  localStorage.removeItem('yachtUser');
  localStorage.removeItem('yachtRefreshToken');
  // 로그인 페이지가 아닐 때만 리디렉션
  if (!location.pathname.includes('login') && !location.pathname.includes('register')) {
    location.href = '/login.html?expired=1';
  }
}

/**
 * 인증 필요한 fetch 래퍼 – 401 응답 시 자동 로그아웃 처리
 */
async function authFetch(url, options = {}) {
  const token = await ensureValidToken();
  if (!token) return null;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': 'Bearer ' + token
    }
  });
  if (res.status === 401) {
    clearAuthAndRedirect();
    return null;
  }
  return res;
}

// 로그인 페이지에서 세션 만료 메시지 표시
(function checkExpiredParam() {
  if (new URLSearchParams(location.search).get('expired') === '1') {
    setTimeout(() => {
      const alertEl = document.getElementById('loginAlert');
      if (alertEl) {
        alertEl.className = 'alert error show';
        alertEl.style.display = 'block';
        alertEl.textContent = '세션이 만료되었습니다. 다시 로그인해주세요.';
      }
    }, 100);
  }
})();

// ── Nav scroll + Auth 상태 반영 (E-2) ──
(function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  const onScroll = () => {
    if (window.scrollY > 50) { nav.classList.add('scrolled'); nav.classList.remove('transparent'); }
    else { nav.classList.remove('scrolled'); nav.classList.add('transparent'); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const token    = getToken();
  const user     = getUser();
  const navAuth  = document.getElementById('navAuth');
  const navUser  = document.getElementById('navUser');
  const navAdmin = document.getElementById('navAdmin');
  if (token && user) {
    if (navAuth)  navAuth.style.display  = 'none';
    if (navUser)  navUser.style.display  = 'block';
    if (navAdmin) navAdmin.style.display = user.role === 'admin' ? 'block' : 'none';
    const userLink = navUser?.querySelector('a');
    if (userLink && user.name) {
      userLink.innerHTML = `<i class="fas fa-user-circle" style="margin-right:5px;font-size:13px"></i>${user.name}`;
    }
  } else {
    if (navAdmin) navAdmin.style.display = 'none';
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
    setTimeout(() => overlay.classList.add('hidden'), 200);
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

// ── Nav scroll + Auth 상태 반영 (E-2) ──
(function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  const onScroll = () => {
    if (window.scrollY > 50) { nav.classList.add('scrolled'); nav.classList.remove('transparent'); }
    else { nav.classList.remove('scrolled'); nav.classList.add('transparent'); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const token    = getToken();
  const user     = getUser();
  const navAuth  = document.getElementById('navAuth');
  const navUser  = document.getElementById('navUser');
  const navAdmin = document.getElementById('navAdmin');
  if (token && user) {
    if (navAuth)  navAuth.style.display  = 'none';
    if (navUser)  navUser.style.display  = 'block';
    if (navAdmin) navAdmin.style.display = user.role === 'admin' ? 'block' : 'none';
    const userLink = navUser?.querySelector('a');
    if (userLink && user.name) {
      userLink.innerHTML = `<i class="fas fa-user-circle" style="margin-right:5px;font-size:13px"></i>${user.name}`;
    }
  } else {
    if (navAdmin) navAdmin.style.display = 'none';
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
    setTimeout(() => overlay.classList.add('hidden'), 200);
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
