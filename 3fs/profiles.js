// ============================================================
// PLAYER PROFILES — saveable, name+PIN recoverable
// Requires: db (Firebase Realtime Database ref) — set up in game.js
// ============================================================
const PROFILE_ID_KEY = '3fs-profile-id';
let myProfile = null; // { id, name, avatar, color, stats:{gamesPlayed,wins,losses,currentStreak,bestStreak} }
let _statsRecordedForThisGame = false;

function sanitizeName(name){
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Pure-JS SHA-256 — deliberately NOT using window.crypto.subtle here.
// crypto.subtle only works in a "secure context" (HTTPS, or literally the
// string "localhost"). Testing this app from a phone over the LAN means
// hitting a plain http://192.168.x.x address, which Chrome/Safari treat as
// insecure — crypto.subtle is undefined there, which silently broke PIN
// saving on Android. This implementation works identically on every device
// and context, so hashes stay consistent for cross-device PIN restore.
async function hashString(str){
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return sha256Hex(bin);
}

function sha256Hex(ascii) {
  function rightRotate(value, amount) {
    return (value>>>amount) | (value<<(32 - amount));
  }
  var mathPow = Math.pow;
  var maxWord = mathPow(2, 32);
  var lengthProperty = 'length';
  var i, j;
  var result = '';

  var words = [];
  var asciiBitLength = ascii[lengthProperty] * 8;

  var hash = sha256Hex.h = sha256Hex.h || [];
  var k = sha256Hex.k = sha256Hex.k || [];
  var primeCounter = k[lengthProperty];

  var isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  hash = hash.slice(0, 8);

  ascii += '\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty];) {
    var w = words.slice(j, j += 16);
    var oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      var w15 = w[i - 15], w2 = w[i - 2];

      var a = hash[0], e = hash[4];
      var temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0
        );
      var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      var b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

function genProfileId(){
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function defaultStats(){
  return { gamesPlayed: 0, wins: 0, losses: 0, currentStreak: 0, bestStreak: 0 };
}

function waitForDb(cb, attempts){
  attempts = attempts || 0;
  if(window.db){ cb(); return; }
  if(attempts > 100){ return; } // ~10s, give up quietly
  setTimeout(() => waitForDb(cb, attempts + 1), 100);
}

// ── Create / load / restore ──

async function createProfile(name, avatar, color, pin){
  const id = genProfileId();
  const profile = {
    name, avatar, color,
    stats: defaultStats(),
    createdAt: Date.now(),
    lastSeen: Date.now()
  };
  await db.ref('profiles/' + id).set(profile);
  if(pin){
    const idxKey = await hashString(sanitizeName(name) + '|' + pin);
    await db.ref('profileIndex/' + idxKey).set(id);
  }
  localStorage.setItem(PROFILE_ID_KEY, id);
  myProfile = Object.assign({ id }, profile);
  return myProfile;
}

async function loadProfile(id){
  const snap = await db.ref('profiles/' + id).get();
  if(!snap.exists()) return null;
  myProfile = Object.assign({ id }, snap.val());
  if(!myProfile.stats) myProfile.stats = defaultStats();
  db.ref('profiles/' + id + '/lastSeen').set(Date.now());
  return myProfile;
}

async function restoreProfileByNamePin(name, pin){
  const idxKey = await hashString(sanitizeName(name) + '|' + pin);
  const snap = await db.ref('profileIndex/' + idxKey).get();
  if(!snap.exists()) return null;
  const id = snap.val();
  localStorage.setItem(PROFILE_ID_KEY, id);
  return await loadProfile(id);
}

async function setProfilePin(pin){
  if(!myProfile || !pin) return;
  const idxKey = await hashString(sanitizeName(myProfile.name) + '|' + pin);
  await db.ref('profileIndex/' + idxKey).set(myProfile.id);
}

function initProfile(){
  waitForDb(async () => {
    const savedId = localStorage.getItem(PROFILE_ID_KEY);
    if(savedId){
      const p = await loadProfile(savedId);
      if(p) applyProfileToLobby(p);
    }
  });
}

// ── Lobby wiring ──
// Called from game.js's goToModeSelect() before it actually switches screens.
function onEnterBarProfileCheck(name, avatar, color, proceed){
  if(myProfile){
    // Returning profile: keep name/avatar/color in sync, no prompt needed.
    if(myProfile.name !== name || myProfile.avatar !== avatar || myProfile.color !== color){
      myProfile.name = name; myProfile.avatar = avatar; myProfile.color = color;
      db.ref('profiles/' + myProfile.id).update({ name, avatar, color });
    }
    proceed();
    return;
  }
  if(!window.db){ proceed(); return; } // Firebase not ready — don't block play
  showPinSetupOverlay(name, avatar, color, proceed);
}

function applyProfileToLobby(p){
  const nameInput = document.getElementById('player-name-input');
  if(nameInput && !nameInput.value) nameInput.value = p.name;
  // selectedAvatar/selectedColor are `var` in game.js, so this actually reaches the
  // variable the game uses when creating/joining a room — not just the visual picker.
  window.selectedColor = p.color;
  if(typeof selectAvatarCard === 'function'){
    selectAvatarCard(p.avatar, true);
  } else {
    window.selectedAvatar = p.avatar;
    if(typeof updateP1Avatar === 'function') updateP1Avatar();
  }
  renderProfileBadge();
}

// ── Stats ──

function resetStatsGuard(){ _statsRecordedForThisGame = false; }

async function recordGameResult(won){
  if(_statsRecordedForThisGame) return;
  _statsRecordedForThisGame = true;
  if(!myProfile) return;
  const s = myProfile.stats || defaultStats();
  s.gamesPlayed = (s.gamesPlayed || 0) + 1;
  if(won){
    s.wins = (s.wins || 0) + 1;
    s.currentStreak = (s.currentStreak || 0) + 1;
    s.bestStreak = Math.max(s.bestStreak || 0, s.currentStreak);
  } else {
    s.losses = (s.losses || 0) + 1;
    s.currentStreak = 0;
  }
  myProfile.stats = s;
  try{ await db.ref('profiles/' + myProfile.id + '/stats').set(s); }catch(e){}
  renderProfileBadge();
}

// ── UI: profile badge ──

function renderProfileBadge(){
  const el = document.getElementById('profile-badge');
  if(!el) return;
  // Badge display disabled — was cluttering the lobby.
  el.style.display = 'none';
  return;
  if(!myProfile){ el.style.display = 'none'; return; }
  const s = myProfile.stats || defaultStats();
  el.style.display = 'flex';
  el.innerHTML =
    '<span class="profile-badge-name">' + escHtml(myProfile.name) + '</span>' +
    '<span class="profile-badge-stat">' + s.wins + 'W&ndash;' + s.losses + 'L</span>' +
    (s.currentStreak > 1 ? '<span class="profile-badge-streak">🔥' + s.currentStreak + '</span>' : '');
}

// ── UI: PIN setup overlay (first-time profile creation) ──

function showPinSetupOverlay(name, avatar, color, proceed){
  const overlay = document.getElementById('pin-setup-overlay');
  if(!overlay){ proceed(); return; } // markup missing — don't block play
  overlay.style.display = 'flex';
  const input = document.getElementById('pin-setup-input');
  const status = document.getElementById('pin-setup-status');
  input.value = '';
  status.textContent = '';

  function cleanup(){
    overlay.style.display = 'none';
    confirmBtn.onclick = null;
    skipBtn.onclick = null;
  }

  const confirmBtn = document.getElementById('pin-setup-confirm');
  const skipBtn = document.getElementById('pin-setup-skip');

  confirmBtn.onclick = async () => {
    const pin = input.value.trim();
    if(!/^\d{4}$/.test(pin)){
      status.textContent = 'Enter exactly 4 digits.';
      return;
    }
    confirmBtn.disabled = true;
    await createProfile(name, avatar, color, pin);
    confirmBtn.disabled = false;
    cleanup();
    renderProfileBadge();
    proceed();
  };
  skipBtn.onclick = async () => {
    await createProfile(name, avatar, color, null);
    cleanup();
    renderProfileBadge();
    proceed();
  };
}

// ── UI: restore-profile overlay ──

function showRestoreOverlay(){
  const overlay = document.getElementById('pin-restore-overlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  document.getElementById('restore-name-input').value = '';
  document.getElementById('restore-pin-input').value = '';
  document.getElementById('restore-status').textContent = '';
}

function closeRestoreOverlay(){
  const overlay = document.getElementById('pin-restore-overlay');
  if(overlay) overlay.style.display = 'none';
}

async function submitRestoreProfile(){
  const name = document.getElementById('restore-name-input').value.trim();
  const pin = document.getElementById('restore-pin-input').value.trim();
  const status = document.getElementById('restore-status');
  if(!name || !/^\d{4}$/.test(pin)){
    status.textContent = 'Enter your name and 4-digit PIN.';
    return;
  }
  status.textContent = 'Looking...';
  const p = await restoreProfileByNamePin(name, pin);
  if(!p){
    status.textContent = 'No profile found for that name + PIN.';
    return;
  }
  applyProfileToLobby(p);
  status.textContent = 'Profile restored!';
  setTimeout(closeRestoreOverlay, 900);
}
