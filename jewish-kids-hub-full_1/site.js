/* ============================================
   Jewish Kids Hub — shared site behavior
   Include after firebase-init.js.
   Each page should set window.CURRENT_PAGE = 'home' | 'kka' | 'nach' | 'halachos' | 'magazine' | 'moshiach' | 'contact'
   before this script runs (or right after loading it), so nav highlighting and auth-gated links work.
   ============================================ */

function toast(msg){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'toast'; t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove('show'), 2600);
}

/* ---------- mobile nav toggle ---------- */
function initNavToggle(){
  const btn = document.getElementById('navToggle');
  const links = document.getElementById('navlinks');
  if(btn && links){
    btn.addEventListener('click', ()=> links.classList.toggle('open'));
  }
}

/* ---------- active nav link ---------- */
function initActiveNav(){
  const page = window.CURRENT_PAGE || 'home';
  document.querySelectorAll('.navlinks a[data-page]').forEach(a=>{
    a.classList.toggle('active', a.dataset.page === page);
  });
}

/* ---------- scroll reveal ---------- */
function initReveal(){
  const targets = document.querySelectorAll('.reveal, .reveal-stagger');
  if(!('IntersectionObserver' in window)){
    targets.forEach(t=>t.classList.add('visible'));
    return;
  }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, {threshold:.12, rootMargin:'0px 0px -40px 0px'});
  targets.forEach(t=>io.observe(t));
}

/* ---------- nav auth state (sign in button / user menu) ---------- */
window.currentUser = null;
window._authListeners = [];
function onAuthChange(fn){ window._authListeners.push(fn); if(typeof auth !== 'undefined') fn(window.currentUser); }

function initNavAuth(){
  const signInBtn = document.getElementById('navSignInBtn');
  const userMenu = document.getElementById('navUserMenu');

  // Optimistic render: if we showed this person's name last time, show it again
  // immediately instead of flashing "Sign In" while Firebase confirms in the background.
  const cachedName = localStorage.getItem('jkh_cached_name');
  if(signInBtn && cachedName){
    signInBtn.innerHTML = `Hi, ${cachedName} ▾`;
    signInBtn.onclick = (e)=>{ e.stopPropagation(); if(userMenu) userMenu.classList.toggle('show'); };
  }

  auth.onAuthStateChanged(user=>{
    window.currentUser = user;
    window._authListeners.forEach(fn=> fn(user));

    if(!signInBtn) return;
    if(user){
      db.ref('users/'+user.uid).once('value').then(snap=>{
        const profile = snap.val() || {};
        const firstName = profile.firstName || (user.displayName ? user.displayName.split(' ')[0] : 'Friend');
        localStorage.setItem('jkh_cached_name', firstName);
        signInBtn.innerHTML = `Hi, ${firstName} ▾`;
        signInBtn.onclick = (e)=>{ e.stopPropagation(); userMenu.classList.toggle('show'); };
      });
    } else {
      localStorage.removeItem('jkh_cached_name');
      signInBtn.innerHTML = `👤 Sign In`;
      signInBtn.onclick = ()=> location.href = '/login.html';
      if(userMenu) userMenu.classList.remove('show');
    }
  });

  window.addEventListener('click', ()=>{ if(userMenu) userMenu.classList.remove('show'); });
}

/* ---------- members-only video gating ---------- */
// A video is locked if: it's flagged membersOnly AND (no end date, or the end date hasn't passed yet) AND nobody is signed in.
function isMembersOnlyLocked(item, user){
  if(!item || !item.membersOnly) return false;
  if(item.membersOnlyUntil){
    const until = new Date(item.membersOnlyUntil).getTime();
    if(!isNaN(until) && Date.now() > until) return false; // window expired — public now
  }
  return !(user || window.currentUser);
}
function membersOnlyBadgeHtml(item){
  if(!item || !item.membersOnly) return '';
  if(item.membersOnlyUntil){
    const until = new Date(item.membersOnlyUntil).getTime();
    if(!isNaN(until) && Date.now() > until) return '';
    const dateStr = new Date(item.membersOnlyUntil).toLocaleDateString(undefined,{month:'short',day:'numeric'});
    return `<span class="tag-pill" style="background:var(--choc);color:var(--secondary);">🔒 Members until ${dateStr}</span>`;
  }
  return `<span class="tag-pill" style="background:var(--choc);color:var(--secondary);">🔒 Members Only</span>`;
}
function lockedThumbOverlay(){
  return `<div class="play"><span>🔒</span></div>`;
}

/* ---------- scheduled release gating (no sign-in involved, just a timer) ---------- */
function isBeforeRelease(item){
  if(!item || !item.releaseAt) return false;
  const t = new Date(item.releaseAt).getTime();
  return !isNaN(t) && Date.now() < t;
}
function releaseBadgeHtml(item){
  if(!isBeforeRelease(item)) return '';
  const d = new Date(item.releaseAt);
  const dateStr = d.toLocaleDateString(undefined,{month:'short', day:'numeric'}) + ' at ' + d.toLocaleTimeString(undefined,{hour:'numeric', minute:'2-digit'});
  return `<span class="tag-pill" style="background:#2C5F6F;color:#fff;">⏳ Releases ${dateStr}</span>`;
}
function releaseLockedOverlay(){
  return `<div class="play"><span>⏳</span></div>`;
}

/* ---------- Cloudinary image upload ---------- */
function uploadToCloudinary(file, onSuccess, onError){
  if(typeof CLOUDINARY_CLOUD_NAME === 'undefined' || CLOUDINARY_CLOUD_NAME.indexOf('YOUR_') === 0){
    toast('Cloudinary isn\'t set up yet — add your Cloud Name and preset to cloudinary-config.js');
    if(onError) onError();
    return;
  }
  if(!file.type.startsWith('image/')){
    toast('Please choose an image file.');
    if(onError) onError();
    return;
  }
  toast('Uploading image…');
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  fetch(url, { method:'POST', body:formData })
    .then(r=>r.json())
    .then(data=>{
      if(data.secure_url){ onSuccess(data.secure_url); toast('Image uploaded!'); }
      else { toast('Upload failed: ' + (data.error?.message || 'unknown error')); if(onError) onError(); }
    })
    .catch(err=>{ toast('Upload failed: ' + err.message); if(onError) onError(); });
}

// Wires a hidden <input type="file"> to upload and fill a target text field (+ optional preview <img>)
function handleImageUpload(inputEl, targetFieldId, previewId){
  const file = inputEl.files[0];
  if(!file) return;
  uploadToCloudinary(file, url=>{
    const targetEl = document.getElementById(targetFieldId);
    if(targetEl) targetEl.value = url;
    if(previewId){ const prevEl = document.getElementById(previewId); if(prevEl) prevEl.src = url; }
  });
  inputEl.value = ''; // reset so choosing the same file again still fires onchange
}

/* ---------- truncated synopsis with "Show more" ---------- */
function synopsisHtml(text, max){
  text = text || '';
  max = max || 78;
  if(text.length <= max) return `<p class="card-synopsis">${escHtml(text)}</p>`;
  const truncated = text.slice(0, max).trim();
  return `<p class="card-synopsis" data-full="${escHtml(text)}" data-truncated="${escHtml(truncated)}" data-expanded="false">${escHtml(truncated)}… <button type="button" class="show-more-btn" onclick="toggleSynopsis(event,this)">Show more</button></p>`;
}
function toggleSynopsis(e, btn){
  e.preventDefault();
  e.stopPropagation();
  const p = btn.closest('.card-synopsis');
  const expanded = p.dataset.expanded === 'true';
  if(expanded){
    p.innerHTML = `${p.dataset.truncated}… <button type="button" class="show-more-btn" onclick="toggleSynopsis(event,this)">Show more</button>`;
    p.dataset.expanded = 'false';
  } else {
    p.innerHTML = `${p.dataset.full} <button type="button" class="show-more-btn" onclick="toggleSynopsis(event,this)">Show less</button>`;
    p.dataset.expanded = 'true';
  }
}

/* ---------- comments (KKA / Nach Heroes episode detail pages) ---------- */
let _commentsListenerRef = null;
function escHtml(str){ return String(str??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function initCommentsSection(containerEl, onType, onId){
  if(!containerEl) return;
  if(_commentsListenerRef) _commentsListenerRef.off();

  containerEl.innerHTML = `
    <div class="comments-section">
      <h4 class="comments-heading">💬 Comments</h4>
      <div id="comments-list"></div>
      <div id="comments-form" style="margin-top:16px;"></div>
    </div>`;
  const listEl = containerEl.querySelector('#comments-list');
  const formEl = containerEl.querySelector('#comments-form');

  _commentsListenerRef = db.ref('comments');
  _commentsListenerRef.on('value', snap=>{
    const all = snapToArray(snap).filter(c=> c.onType===onType && c.onId===onId && c.approved);
    all.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
    listEl.innerHTML = all.length ? all.map(c=>`
      <div class="comment-item">
        <div class="comment-item-name">${escHtml(c.name||'Anonymous')}</div>
        <div class="comment-item-text">${escHtml(c.text||'')}</div>
      </div>`).join('') : `<p style="color:var(--fg-soft);font-size:13.5px;">No comments yet — be the first!</p>`;
  });

  onAuthChange(user=>{
    if(user){
      formEl.innerHTML = `
        <textarea id="comment-input" placeholder="Share your thoughts..." style="min-height:70px;"></textarea>
        <button class="btn btn-sm" style="margin-top:8px;" onclick="submitComment('${onType}','${onId}')">Post Comment</button>
        <p class="form-note" style="margin-top:8px;">Comments are reviewed before they show publicly.</p>`;
    } else {
      formEl.innerHTML = `<p style="font-size:13.5px;color:var(--fg-soft);">
        <a href="/login.html" style="color:var(--accent);font-weight:700;">Sign in</a> to leave a comment.</p>`;
    }
  });
}

/* ---------- shared "Add Child" modal (used on profile.html and kka-episode.html) ---------- */
const HEBREW_MONTHS = ['Tishrei','Cheshvan','Kislev','Teves','Shevat','Adar','Adar I','Adar II','Nissan','Iyar','Sivan','Tammuz','Av','Elul'];
const CHILD_COLORS = ['#FF9900','#2C5F6F','#8fae6b','#F9681F','#6B4E9B','#C9622D'];

function childColor(seed){
  let hash = 0;
  const str = String(seed || '');
  for(let i=0;i<str.length;i++){ hash = str.charCodeAt(i) + ((hash << 5) - hash); }
  return CHILD_COLORS[Math.abs(hash) % CHILD_COLORS.length];
}
function childAvatarHtml(child){
  const initial = (child.firstName || child.name || '?').trim().charAt(0).toUpperCase();
  return `<div class="child-avatar" style="background:${childColor(child.id || child.firstName)};">${initial}</div>`;
}

function ensureAddChildModal(){
  if(document.getElementById('addChildOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'addChildOverlay';
  overlay.className = 'site-modal-overlay';
  overlay.innerHTML = `
    <div class="site-modal-card">
      <button class="site-modal-close" type="button" onclick="closeAddChildModal()">×</button>
      <div style="text-align:center; margin-bottom:18px;">
        <div style="font-size:2.2rem; margin-bottom:6px;">👶</div>
        <h3 style="font-size:1.2rem;">Add a Child</h3>
        <p style="font-size:.82rem; color:var(--fg-soft); margin-top:4px;">So they can answer questions and more!</p>
      </div>
      <div class="form-row" style="margin-bottom:14px;">
        <div><label>First Name</label><input id="child-firstName" placeholder="Moshe"></div>
        <div><label>Last Name</label><input id="child-lastName" placeholder="Cohen"></div>
      </div>
      <div style="margin-bottom:16px;"><label>Age</label><input id="child-age" type="number" min="0" max="18" placeholder="7"></div>
      <div style="background:var(--muted); border-radius:14px; padding:14px 16px 4px;">
        <label style="font-size:.78rem; font-weight:800; color:var(--accent); display:block; margin-bottom:10px;">Hebrew Birthday</label>
        <div class="form-row">
          <div><label>Day</label><input id="child-hebDay" type="number" min="1" max="30" placeholder="e.g. 3"></div>
          <div><label>Month</label>
            <select id="child-hebMonth">
              <option value="">Choose…</option>
              ${HEBREW_MONTHS.map(m=>`<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <button class="btn" style="width:100%; margin-top:18px;" onclick="submitAddChild()">Add Child</button>
      <div class="auth-error" id="child-add-error"></div>
    </div>`;
  document.body.appendChild(overlay);
}

let _addChildCallback = null;
function openAddChildModal(onAdded){
  ensureAddChildModal();
  ['child-firstName','child-lastName','child-age','child-hebDay'].forEach(id=> document.getElementById(id).value = '');
  document.getElementById('child-hebMonth').value = '';
  document.getElementById('child-add-error').textContent = '';
  _addChildCallback = onAdded || null;
  document.getElementById('addChildOverlay').classList.add('active');
}
function closeAddChildModal(){
  const el = document.getElementById('addChildOverlay');
  if(el) el.classList.remove('active');
}
function submitAddChild(){
  const firstName = document.getElementById('child-firstName').value.trim();
  const lastName = document.getElementById('child-lastName').value.trim();
  const age = document.getElementById('child-age').value;
  const hebDay = document.getElementById('child-hebDay').value;
  const hebMonth = document.getElementById('child-hebMonth').value;
  const errEl = document.getElementById('child-add-error');
  errEl.textContent = '';
  if(!firstName){ errEl.textContent = 'First name is required.'; return; }
  if(!hebDay || !hebMonth){ errEl.textContent = 'Hebrew birthday (day and month) is required.'; return; }
  if(!window.currentUser){ errEl.textContent = 'Please sign in first.'; return; }
  db.ref('users/'+window.currentUser.uid+'/children').push({
    firstName, lastName,
    age: age ? Number(age) : null,
    hebrewBirthdayDay: hebDay ? Number(hebDay) : null,
    hebrewBirthdayMonth: hebMonth || null,
    createdAt: Date.now()
  }).then(ref=>{
    closeAddChildModal();
    toast(`${firstName} added!`);
    if(_addChildCallback) _addChildCallback(ref.key);
  }).catch(err=> errEl.textContent = err.message);
}
function childDisplayName(k){
  const full = [k.firstName || k.name, k.lastName].filter(Boolean).join(' ');
  return k.age != null ? `${full} (${k.age})` : full;
}

function submitComment(onType, onId){
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if(!text) return;
  const user = window.currentUser;
  if(!user){ toast('Please sign in first.'); return; }
  db.ref('users/'+user.uid).once('value').then(snap=>{
    const profile = snap.val() || {};
    const name = profile.firstName ? `${profile.firstName} ${(profile.lastName||'').charAt(0)}${profile.lastName?'.':''}`.trim() : (user.displayName || 'Member');
    return db.ref('comments').push({ onType, onId, uid:user.uid, name, text, approved:false, timestamp:Date.now() });
  }).then(()=>{
    input.value = '';
    toast('Comment submitted! It will show once approved.');
  }).catch(err=> toast(err.message));
}

/* ---------- question & answer (KKA episodes, answered per-child) ---------- */
let _questionVideo = null;
let _questionKids = [];

function initQuestionSection(containerEl, video){
  _questionVideo = video;
  if(!containerEl) return;
  if(!video.question){ containerEl.innerHTML = ''; return; }

  containerEl.innerHTML = `
    <div class="question-section">
      <div class="question-eyebrow">🙋 Question Time!</div>
      <p class="question-text">${escHtml(video.question)}</p>
      <div id="question-body"><p class="profile-note">Loading…</p></div>
    </div>`;

  onAuthChange(user=>{
    const bodyEl = document.getElementById('question-body');
    if(!bodyEl) return;
    if(!user){
      bodyEl.innerHTML = `<p class="profile-note">Sign in to answer with your kids! <a href="/login.html" style="color:var(--accent); font-weight:700;">Sign in</a></p>`;
      return;
    }
    db.ref('users/'+user.uid+'/children').once('value').then(snap=>{
      _questionKids = snapToArray(snap);
      renderChildSelect();
    });
  });
}

function renderChildSelect(){
  const bodyEl = document.getElementById('question-body');
  if(!bodyEl) return;
  bodyEl.innerHTML = `
    <label style="font-size:.82rem; font-weight:700; color:var(--fg-soft); display:block; margin-bottom:8px;">Answering as:</label>
    <select id="question-child-select">
      <option value="">Choose a child…</option>
      ${_questionKids.map(k=>`<option value="${k.id}">${escHtml(childDisplayName(k))}</option>`).join('')}
      <option value="__add__">+ Add a new child</option>
    </select>
    <div id="question-answer-area" style="margin-top:14px;"></div>`;
  document.getElementById('question-child-select').addEventListener('change', e=>{
    if(e.target.value === '__add__'){
      e.target.value = '';
      openAddChildModal(newChildId=>{
        db.ref('users/'+window.currentUser.uid+'/children').once('value').then(snap=>{
          _questionKids = snapToArray(snap);
          renderChildSelect();
          const sel = document.getElementById('question-child-select');
          if(sel){ sel.value = newChildId; loadAnswerArea(newChildId); }
        });
      });
      return;
    }
    loadAnswerArea(e.target.value);
  });
}

function loadAnswerArea(childId){
  const areaEl = document.getElementById('question-answer-area');
  if(!areaEl) return;
  if(!childId){ areaEl.innerHTML = ''; return; }
  const child = _questionKids.find(k=>k.id===childId);
  areaEl.innerHTML = `<p class="profile-note">Checking…</p>`;

  db.ref(`answers/${_questionVideo.id}/${childId}`).once('value').then(snap=>{
    if(snap.exists()){
      const a = snap.val();
      areaEl.innerHTML = `<div class="profile-note recorded">✓ ${escHtml(childDisplayName(child))}'s answer (<strong>${escHtml(a.answer)}</strong>) has already been recorded.</div>`;
      return;
    }
    const options = _questionVideo.questionOptions || [];
    const letters = ['A','B','C','D','E','F'];
    areaEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'question-options';
    options.forEach((opt,i)=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'question-option-btn';
      btn.innerHTML = `<span class="opt-letter">${letters[i]||i+1}</span><span></span>`;
      btn.querySelector('span:last-child').textContent = opt;
      btn.addEventListener('click', ()=> submitAnswer(childId, i, opt));
      wrap.appendChild(btn);
    });
    areaEl.appendChild(wrap);
  });
}

function submitAnswer(childId, optionIndex, optionText){
  const child = _questionKids.find(k=>k.id===childId);
  const correct = (Number(_questionVideo.correctAnswer) - 1) === optionIndex;
  db.ref(`answers/${_questionVideo.id}/${childId}`).set({
    answer: optionText, correct, parentUid: window.currentUser.uid, childName: childDisplayName(child), timestamp: Date.now()
  }).then(()=>{
    const areaEl = document.getElementById('question-answer-area');
    if(areaEl) areaEl.innerHTML = `<div class="profile-note recorded">✓ Thanks! ${escHtml(childDisplayName(child))}'s answer has been recorded.</div>`;
  }).catch(err=> toast(err.message));
}

function handleSignOut(){
  auth.signOut().then(()=>{ toast('Signed out successfully.'); setTimeout(()=>location.href='/index.html', 700); });
}

/* ---------- footer mailing list form (present on every public page) ---------- */
function initMailingListForm(){
  const form = document.getElementById('notifForm');
  if(!form) return;
  form.addEventListener('submit', e=>{
    e.preventDefault();
    const email = document.getElementById('notifEmail').value;
    db.ref('notifications').push({email, timestamp:Date.now()})
      .then(()=>{ toast('Joined the mailing list!'); form.reset(); })
      .catch(err=> toast(err.message));
  });
}

/* ---------- media helpers (thumbnails + youtube embeds) ---------- */
function thumbStyle(url){
  return url ? ` style="background-image:url('${url}')"` : '';
}
function ytEmbedHtml(youtubeId, thumbnailUrl, label){
  if(youtubeId){
    return `<iframe src="https://www.youtube.com/embed/${youtubeId}" allowfullscreen title="${label||''}"></iframe>`;
  }
  return `<div class="placeholder"${thumbStyle(thumbnailUrl)}>${thumbnailUrl ? '' : '🎬<div>Video coming soon</div>'}</div>`;
}

function snapToArray(snap){
  const v = snap.val();
  return v ? Object.entries(v).map(([id,d])=>({id, ...d})) : [];
}

// Reads an item id from either the old ?id=... query string (still supported)
// or a clean path like /kka/episode/ep1 (used via the host's redirect rules).
function getIdFromUrl(pathPrefix){
  const fromQuery = new URLSearchParams(location.search).get('id');
  if(fromQuery) return fromQuery;
  const parts = location.pathname.split('/').filter(Boolean);
  if(parts[0] === pathPrefix && parts.length >= 2) return decodeURIComponent(parts[parts.length - 1]);
  return null;
}

// Finds an item by its custom slug first, falling back to its Firebase key.
function findBySlugOrId(items, param){
  if(!param) return null;
  return items.find(it => (it.slug && it.slug === param)) || items.find(it => it.id === param) || null;
}

// Shimmering placeholder cards shown while a grid's data is still loading.
function skeletonCards(n){
  n = n || 3;
  let html = '';
  for(let i=0;i<n;i++){
    html += `<div class="skeleton-card"><div class="skeleton-thumb"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>`;
  }
  return html;
}

/* ---------- confetti burst (fun success moments) ---------- */
function confettiBurst(originEl){
  const colors = ['#FF9900','#FFD24D','#F9681F','#F2A65A','#FFCB77'];
  const rect = originEl ? originEl.getBoundingClientRect() : {left: window.innerWidth/2, top: window.innerHeight/3, width:0, height:0};
  const originX = rect.left + rect.width/2;
  const originY = rect.top + rect.height/2;
  const count = 26;
  for(let i=0; i<count; i++){
    const piece = document.createElement('div');
    const size = 6 + Math.random()*6;
    const isCircle = Math.random() > 0.5;
    piece.style.cssText = `position:fixed; left:${originX}px; top:${originY}px; width:${size}px; height:${size}px; background:${colors[i%colors.length]}; border-radius:${isCircle?'50%':'2px'}; pointer-events:none; z-index:9999;`;
    document.body.appendChild(piece);
    const angle = Math.random()*Math.PI*2;
    const distance = 60 + Math.random()*110;
    const dx = Math.cos(angle)*distance;
    const dy = Math.sin(angle)*distance*0.6 - 40;
    const duration = 700 + Math.random()*500;
    const anim = piece.animate([
      {transform:'translate(0,0) rotate(0deg)', opacity:1},
      {transform:`translate(${dx}px, ${dy+240}px) rotate(${Math.random()*720-360}deg)`, opacity:0}
    ], {duration, easing:'cubic-bezier(.2,.7,.3,1)'});
    anim.onfinish = ()=> piece.remove();
  }
}

/* ---------- nav shrinks + gains shadow once you scroll ---------- */
function initNavScrollShrink(){
  const nav = document.querySelector('.navbar');
  if(!nav) return;
  const onScroll = ()=> nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();
}

/* ---------- back-to-top button ---------- */
function initBackToTop(){
  if(document.getElementById('backToTopBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'backToTopBtn';
  btn.innerHTML = '↑';
  btn.setAttribute('aria-label', 'Back to top');
  document.body.appendChild(btn);
  window.addEventListener('scroll', ()=>{
    btn.classList.toggle('show', window.scrollY > 500);
  }, {passive:true});
  btn.addEventListener('click', ()=> window.scrollTo({top:0, behavior:'smooth'}));
}

/* ---------- analytics: simple page-view counter ---------- */
function logPageView(){
  const page = window.CURRENT_PAGE || 'unknown';
  if(typeof db === 'undefined') return;
  db.ref('analytics/pageViews/'+page).transaction(v=> (v||0)+1);
  db.ref('analytics/totalViews').transaction(v=> (v||0)+1);
  db.ref('analytics/lastVisit').set(Date.now());
}

/* ---------- dynamic site images (managed from Admin → Page Images) ---------- */
function applySiteImages(){
  if(typeof db === 'undefined') return;
  db.ref('siteImages').once('value').then(snap=>{
    const vals = snap.val() || {};
    document.querySelectorAll('[data-imgkey]').forEach(el=>{
      const key = el.dataset.imgkey;
      if(vals[key]){ el.src = vals[key]; }
    });
  });
}

/* ---------- announcement banner (managed from Admin → Notifications) ---------- */
function renderAnnouncementBanner(){
  if(typeof db === 'undefined') return;
  db.ref('siteSettings/announcement').on('value', snap=>{
    const a = snap.val();
    let bar = document.getElementById('announcement-banner');
    const dismissedText = sessionStorage.getItem('jkh_dismissed_announcement');
    if(a && a.active && a.text && dismissedText !== a.text){
      if(!bar){
        bar = document.createElement('div');
        bar.id = 'announcement-banner';
        bar.style.cssText = 'background:var(--primary);color:#fff;text-align:center;padding:10px 44px 10px 16px;font-weight:700;font-size:.85rem;position:relative;';
        document.body.insertBefore(bar, document.body.firstChild);
      }
      bar.innerHTML = `<span></span><button aria-label="Dismiss" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#fff;font-size:1.1rem;cursor:pointer;">×</button>`;
      bar.querySelector('span').textContent = a.text;
      bar.querySelector('button').onclick = ()=>{ sessionStorage.setItem('jkh_dismissed_announcement', a.text); bar.remove(); };
    } else if(bar){
      bar.remove();
    }
  });
}

/* ---------- homepage content (managed from Admin → Homepage) ---------- */
function applyHomepageSettings(){
  if(typeof db === 'undefined') return;
  db.ref('siteSettings/homepage').once('value').then(snap=>{
    const h = snap.val(); if(!h) return;
    const set = (id, val)=>{ const el=document.getElementById(id); if(el && val){ el.textContent = val; } };
    set('hp-badge', h.badgeText);
    set('hp-heading-prefix', h.headingPrefix);
    set('hp-heading-highlight', h.headingHighlight);
    set('hp-heading-suffix', h.headingSuffix);
    set('hp-tagline-en', h.taglineEn);
    set('hp-tagline-heb', h.taglineHeb);
    set('hp-tagline-cite', h.taglineCite);
    set('hp-description', h.description);
  });
}

/* ---------- CSV export helper (used by admin) ---------- */
function exportCsv(filename, rows){
  const csv = rows.map(r=> r.map(cell=>{
    const s = String(cell??'');
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', ()=>{
  initNavToggle();
  initActiveNav();
  initReveal();
  initMailingListForm();
  if(typeof auth !== 'undefined') initNavAuth();
  if(typeof db !== 'undefined'){
    logPageView();
    applySiteImages();
    renderAnnouncementBanner();
    if(window.CURRENT_PAGE === 'home') applyHomepageSettings();
  }
});
