// PERFORMANCE: register the service worker so repeat visits load from
// cache instead of refetching every asset from the network each time.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}

// Critical globals — defined immediately so onclick handlers work
window.tutorialOn = localStorage.getItem('3fs-tutorial')==='1';

window.setTutorial = function(on){
  window.tutorialOn = on;
  if(typeof tutorialOn !== 'undefined') { try{ tutorialOn = on; }catch(e){} }
  ['tut-toggle-rules','tut-toggle-game','tut-toggle-lobby'].forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.checked=on;
  });
  localStorage.setItem('3fs-tutorial', on?'1':'0');
};

window.showRules = function(){
  var overlay=document.getElementById('rules-overlay');
  if(!overlay){ console.log('rules-overlay not found'); return; }
  overlay.style.display='flex';
  overlay.classList.add('show');
  var t=document.getElementById('tut-toggle-rules');
  if(t) t.checked=window.tutorialOn||false;
};

let db;

const firebaseConfig = {
  apiKey: "AIzaSyDP11Br_OTiCxYSSPM6LERO3wadPuhHgws",
  authDomain: "three-flowers-efb99.firebaseapp.com",
  databaseURL: "https://three-flowers-efb99-default-rtdb.firebaseio.com",
  projectId: "three-flowers-efb99",
  storageBucket: "three-flowers-efb99.firebasestorage.app",
  messagingSenderId: "688997367715",
  appId: "1:688997367715:web:28a79fd44a1bed40732416",
  measurementId: "G-WBTWHSCD6L"
};
// Wait for Firebase to be ready

// ── TUTORIAL POPUP ──
function showTutorialPopup(card, x, y){
  if(!window.tutorialOn && !tutorialOn) return;
  removeTutorialPopup();
  const s = cpuMode ? cpuState : gameState;
  const topCard = s ? s.topCard : null;
  let title='', body='';

  if(card.face==='3'){
    title='THE 3 — UNBEATABLE';
    body='The 3 is the highest card in the game. Nothing can beat it. Play it to dominate the pile.';
  } else if(card.face==='10'){
    title='THE 10 — BLOW AWAY';
    body='Playing a 10 automatically blows the entire play pile to the blown deck. You go again after.';
  } else if(card.face==='2'){
    title='THE 2 — RESTART';
    body='Playing a 2 resets the pile. YOU go again — play any card. Your opponent then needs to match or beat whatever you play next.';
  } else if(!topCard){
    title='START THE PILE';
    body='No card on the pile yet. Play any card to start it. Your opponent must then match or beat it.';
  } else if(cardRank(card) >= cardRank(topCard)){
    title='PLAYABLE — ' + card.face + ' beats ' + topCard.face;
    body='This card can match or beat the ' + topCard.face + ' on the pile. Select it then tap the pile to play.';
  } else {
    title='TOO LOW — CANNOT PLAY';
    body='This ' + card.face + ' cannot beat the ' + topCard.face + ' on the pile. Pick a higher card or tap the pile to pick it up.';
  }

  const popup = document.createElement('div');
  popup.className = 'tutorial-popup';
  popup.id = 'tut-popup';
  popup.innerHTML = '<h3>' + title + '</h3><p>' + body + '</p><button class="close-tut" onclick="removeTutorialPopup()">GOT IT</button>';

  const pw = Math.min(260, window.innerWidth - 24);
  let px = x - pw / 2;
  let py = y - 170;
  px = Math.max(12, Math.min(px, window.innerWidth - pw - 12));
  py = Math.max(60, py);
  popup.style.cssText = 'left:' + px + 'px;top:' + py + 'px;width:' + pw + 'px;position:fixed;z-index:800;';
  document.body.appendChild(popup);
  setTimeout(removeTutorialPopup, 5000);
}

function removeTutorialPopup(){
  const p = document.getElementById('tut-popup');
  if(p) p.remove();
}

function initFirebase(){
  try {
    firebase.initializeApp(firebaseConfig);
    window.db = firebase.database();
    db = window.db;
  } catch(e){
    setTimeout(initFirebase, 100);
    return;
  }
}
initFirebase();

const ORDER=['4','5','6','7','8','9','J','Q','K','A','3'];
const SUITS=['spades','hearts','diamonds','clubs'];
const SYM={spades:'♠',hearts:'♥',diamonds:'♦',clubs:'♣'};
const RED_SUITS=['hearts','diamonds'];
const MIN_HAND=3;

let myRole=null,roomCode=null,roomRef=null,myName='';
let cpuMode=false, cpuState=null, cpuThinkTimeout=null;
let tutorialOn=false;
let selectedIdxs=[],localHand=[],gameState=null,hasPlayed=false,resolving=false;
let setupHand=[],setupSelectedIdxs=[],setupEntered=false;
let gameListening=false,chatListening=false;

const sym=s=>SYM[s]||s;
const isRed=s=>RED_SUITS.includes(s);
function cardRank(c){
  if(c.face==='2') return -1;
  if(c.face==='10') return -2;
  return ORDER.indexOf(c.face);
}
const setLobbyStatus=m=>document.getElementById('lobby-status').textContent=m;
function genCode(){
  const ch='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c='';for(let i=0;i<4;i++)c+=ch[Math.floor(Math.random()*ch.length)];return c;
}
function buildDeck(){
  const faces=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  let d=[];
  for(let s of SUITS)for(let f of faces)d.push({face:f,suit:s});
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
  return d;
}

// createRoom — see lobby override below

// joinRoom — see lobby override below

function dealInitial(){
  const deck=buildDeck();
  const p1Hand=[],p2Hand=[],p1Blind=[],p2Blind=[];
  for(let i=0;i<10;i++){p1Hand.push(deck.pop());p2Hand.push(deck.pop());}
  for(let i=0;i<3;i++){p1Blind.push(deck.pop());p2Blind.push(deck.pop());}
  // Write all game data first, then set status so listeners fire after cards exist
  roomRef.update({
    p1Hand,p2Hand,p1Blind,p2Blind,
    deck,
    p1Chosen:null,p2Chosen:null,
    p1Ready:false,p2Ready:false,
    playPile:[],topCard:null,
    p1Played:null,p2Played:null,
    result:null,gameOver:false,winner:null
  }).then(()=>{
    // Set status AFTER cards are written so listeners always get full state
    roomRef.update({status:'setup'});
  });
}

function enterSetup(s){
  if(setupEntered)return;setupEntered=true;
  document.getElementById('lobby').style.display='none';
  document.getElementById('setup').style.display='block';
  setupHand=myRole==='p1'?[...(s.p1Hand||[])]: [...(s.p2Hand||[])];
  setupSelectedIdxs=[];renderSetup();
}

function renderSetup(){
  const el=document.getElementById('setup-hand');el.innerHTML='';
  setupHand.forEach((c,i)=>{
    const sel=setupSelectedIdxs.includes(i);
    const cardEl=makeCardEl(c,true,sel?'setup-selected playable':'playable');
    cardEl.onclick=()=>toggleSetupSelect(i);
    el.appendChild(cardEl);
  });
  const slotsEl=document.getElementById('chosen-slots');slotsEl.innerHTML='';
  for(let i=0;i<3;i++){
    if(i<setupSelectedIdxs.length){
      slotsEl.appendChild(makeCardEl(setupHand[setupSelectedIdxs[i]],true,''));
    } else {
      const slot=document.createElement('div');slot.className='chosen-slot';slot.textContent=(i+1);slotsEl.appendChild(slot);
    }
  }
  document.getElementById('confirm-chosen').disabled=setupSelectedIdxs.length!==3;
  document.getElementById('setup-instructions').textContent=
    setupSelectedIdxs.length===0
      ?'Pick your 3 best cards.'
      :setupSelectedIdxs.length<3
        ?`Pick your 3 best cards. (${3-setupSelectedIdxs.length} left)`
        :'Locked and loaded. Confirm when ready.';
}

function toggleSetupSelect(idx){
  const pos=setupSelectedIdxs.indexOf(idx);
  if(pos>=0)setupSelectedIdxs.splice(pos,1);
  else{if(setupSelectedIdxs.length>=3)return;setupSelectedIdxs.push(idx);}
  renderSetup();
}



function finalizeHands(){
  // Poll until BOTH p1Remaining and p2Remaining exist before finalizing
  let attempts = 0;
  const poll = setInterval(()=>{
    attempts++;
    roomRef.once('value', snap=>{
      const s = snap.val();
      if(!s) return;
      // Wait for both players to have written their remaining cards
      const p1r = s.p1Remaining;
      const p2r = s.p2Remaining;
      if((p1r && p1r.length > 0) && (p2r && p2r.length > 0)){
        clearInterval(poll);
        const firstTurn = Math.random()<0.5 ? 'p1' : 'p2';
        roomRef.update({
          p1Hand: p1r,
          p2Hand: p2r,
          p1Remaining: null,
          p2Remaining: null,
          coinToss: firstTurn,
          turn: firstTurn,
          status: 'playing'
        });
      } else if(attempts > 60){
        // Timeout after 30 seconds - use whatever we have
        clearInterval(poll);
        const firstTurn = Math.random()<0.5 ? 'p1' : 'p2';
        roomRef.update({
          p1Hand: p1r||[],
          p2Hand: p2r||[],
          p1Remaining: null,
          p2Remaining: null,
          coinToss: firstTurn,
          turn: firstTurn,
          status: 'playing'
        });
      }
    });
  }, 500);
}

function enterGame(s){
  if(document.getElementById('game').style.display==='block') return;
  if(typeof resetStatsGuard==='function') resetStatsGuard();
  document.getElementById('lobby').style.display='none';
  document.getElementById('setup').style.display='none';
  document.getElementById('game').style.display='block';
  document.getElementById('room-label').textContent='ROOM: '+roomCode;
  document.getElementById('quit-btn-wrap').style.display='block';
  if(!gameListening){
    gameListening=true;
    roomRef.on('value',snap=>{gameState=snap.val();if(gameState)renderGame(gameState);});
  }
  if(!chatListening){
    chatListening=true;
    db.ref('chats/'+roomCode).on('child_added',snap=>appendChatMsg(snap.val()));
  }
  // Show coin toss
  showCoinToss(s);
}

function showCoinToss(s){
  const overlay=document.getElementById('coin-overlay');
  const resultEl=document.getElementById('coin-result');
  const coinEl=document.getElementById('coin');
  const faceEl=document.getElementById('coin-face');
  const isP1=myRole==='p1';
  const p1n=s.p1?s.p1.name:'P1', p2n=s.p2?s.p2.name:'P2';
  const firstPlayer=s.coinToss==='p1'?p1n:p2n;
  const iGoFirst=s.coinToss===myRole;
  overlay.style.display='flex';
  resultEl.style.opacity='0';

  // s.coinToss is decided with Math.random() server-side (finalizeHands()).
  // The "spin" is just rapidly alternating which of the two coin images is
  // showing, then landing on whichever one matches the real synced result —
  // no 3D transforms/backface-visibility involved, so it can't silently fail.
  const HEADS='./coin-heads.png', TAILS='./coin-tails.png';
  const finalImg = s.coinToss==='p1' ? HEADS : TAILS;
  if(coinEl && faceEl){
    if(window._coinSwapTimer) clearInterval(window._coinSwapTimer);
    coinEl.classList.add('spinning');
    let swaps=0;
    const totalSwaps=16; // ~16 * 110ms ≈ 1.76s of alternating before it settles
    window._coinSwapTimer=setInterval(()=>{
      swaps++;
      faceEl.style.backgroundImage = "url('"+(swaps%2===0?HEADS:TAILS)+"')";
      if(swaps>=totalSwaps){
        clearInterval(window._coinSwapTimer);
        window._coinSwapTimer=null;
        coinEl.classList.remove('spinning');
        faceEl.style.backgroundImage = "url('"+finalImg+"')";
      }
    },110);
  }

  setTimeout(()=>{
    resultEl.textContent=(iGoFirst?'YOU GO FIRST!':firstPlayer.toUpperCase()+' GOES FIRST');
    resultEl.style.opacity='1';
    setTimeout(()=>{
      overlay.style.display='none';
    },2000);
  },2200);
}

function totalCards(s,role){
  return (s[role+'Hand']||[]).length+(s[role+'Chosen']||[]).length+(s[role+'Blind']||[]).length;
}

function renderGame(s){
  const isP1=myRole==='p1';
  const myH=isP1?'p1':'p2',oppH=isP1?'p2':'p1';
  const p1n=s.p1?s.p1.name:'P1',p2n=s.p2?s.p2.name:'P2';
  const oppN=isP1?p2n:p1n;

  document.getElementById('opp-label').textContent=oppN;
  // Always show rules btn during gameplay
  
  // Show big flash for opponent when they get a pickup or blow notification
  if(s.pickupFlash&&s.pickupFlash!==window._lastPickupFlash){
    window._lastPickupFlash=s.pickupFlash;
    showBigFlash('PICK IT UP','pickup');
  }
  if(s.blowFlash&&s.blowFlash!==window._lastBlowFlash){
    window._lastBlowFlash=s.blowFlash;
    showBigFlash('BLOWN AWAY','blown');
  }
  // Show opponent's last played card — persists until they play again
  const lastMsg=document.getElementById('last-played-msg');
  if(lastMsg){
    const pileOpen = !(s.playPile && s.playPile.length);
    if(pileOpen){
      lastMsg.textContent='Pile is open — play any card!';
    } else if(s.lastPlayedBy && s.lastPlayedBy!==myH && s.lastPlayedDesc){
      lastMsg.textContent='Opponent played: '+s.lastPlayedDesc;
    } else if(!s.lastPlayedDesc){
      lastMsg.textContent='';
    }
    // Keep showing even on my turn so I always know what they played
  }
  document.getElementById('name-p1').textContent=isP1?'You':p1n;
  document.getElementById('name-p2').textContent=isP1?p2n:'You';
  document.getElementById('cnt-p1').textContent=totalCards(s,'p1');
  document.getElementById('cnt-p2').textContent=totalCards(s,'p2');

  renderMiniStack('opp-blind-stack',(s[oppH+'Blind']||[]).length,'blind-back');
  renderMiniStack('opp-chosen-stack',(s[oppH+'Chosen']||[]).length,'chosen-back');
  renderMiniStack('my-blind-stack',(s[myH+'Blind']||[]).length,'blind-back');
  renderMiniStack('my-chosen-stack',(s[myH+'Chosen']||[]).length,'chosen-back');
  document.getElementById('opp-blind-count').textContent=(s[oppH+'Blind']||[]).length;
  document.getElementById('opp-chosen-count').textContent=(s[oppH+'Chosen']||[]).length;
  document.getElementById('my-blind-count').textContent=(s[myH+'Blind']||[]).length;
  document.getElementById('my-chosen-count').textContent=(s[myH+'Chosen']||[]).length;

  // Tap hints for chosen/blind pickup
  const myHandNow=(s[myH+'Hand']||[]);
  const myChosenNow=(s[myH+'Chosen']||[]);
  const myBlindNow=(s[myH+'Blind']||[]);
  const chosenHint=document.getElementById('chosen-tap-hint');
  const blindHint=document.getElementById('blind-tap-hint');
  if(chosenHint){
    const potEmpty=(s.deck||[]).length===0;
  chosenHint.textContent=(myHandNow.length===0&&myChosenNow.length>0&&potEmpty)?'TAP TO PICK UP':'';
  }
  if(blindHint){
    blindHint.textContent=(myHandNow.length===0&&myChosenNow.length===0&&myBlindNow.length>0)?'TAP FOR BLIND CARD':'';
  }

  // Pulse chosen/blind stacks when available to pick up
  const chosenStack=document.getElementById('my-chosen-stack');
  const blindStack=document.getElementById('my-blind-stack');
  const potGone=(s.deck||[]).length===0;
  if(chosenStack){
    if(myHandNow.length===0&&myChosenNow.length>0&&potGone) chosenStack.classList.add('can-draw');
    else chosenStack.classList.remove('can-draw');
  }
  if(blindStack){
    if(myHandNow.length===0&&myChosenNow.length===0&&myBlindNow.length>0) blindStack.classList.add('can-draw');
    else blindStack.classList.remove('can-draw');
  }

  const oh=document.getElementById('opp-hand');oh.innerHTML='';
  (s[oppH+'Hand']||[]).forEach(()=>{
    const el=document.createElement('div');
    el.className='card face-down';
    el.style.cssText='width:26px;height:38px;font-size:9px;';
    oh.appendChild(el);
  });

  const pile=s.playPile||[];
  const pileWrapper=document.getElementById('play-pile-top');
  pileWrapper.innerHTML='';
  if(!s.topCard){
    // Empty pile placeholder
    const empty=document.createElement('div');
    empty.className='pile-card empty-pile';
    pileWrapper.appendChild(empty);
  } else {
    // Show up to 4 cards in the stack for visual depth
    const showCount=Math.min(pile.length, 4);
    for(let pi=0;pi<showCount;pi++){
      const card=document.createElement('div');
      card.className='pile-card pile-face-down';
      // offset each card slightly
      const offset=(showCount-1-pi)*4;
      const rot=(pi%2===0?-1:1)*(pi*1.5);
      card.style.cssText=`bottom:${offset+20}px;transform:translateX(-50%) rotate(${rot}deg);z-index:${pi};`;
      pileWrapper.appendChild(card);
    }
    // Top card (face up)
    const topEl=document.createElement('div');
    topEl.className='pile-card pile-top-card'+(isRed(s.topCard.suit)?' red':'');
    topEl.innerHTML=`<span class="corner">${s.topCard.face}<br>${sym(s.topCard.suit)}</span><span>${s.topCard.face}</span>`;
    topEl.style.cssText='bottom:0;transform:translateX(-50%) rotate(0deg);z-index:10;';
    // Animate the top card sliding in
    topEl.style.animation='slideIn 0.25s ease-out';
    pileWrapper.appendChild(topEl);
  }
  document.getElementById('play-pile-count').textContent=pile.length+' card'+(pile.length!==1?'s':'');

  // Render pile card list (mini cards showing what's in pile)
  const pileList=document.getElementById('pile-cards-list');
  if(pileList){
    pileList.innerHTML='';
    pile.forEach(c=>{
      const mc=document.createElement('div');
      mc.className='pile-mini-card'+(isRed(c.suit)?' red':'');
      mc.innerHTML='<span class="mcorner">'+c.face+'</span>'+c.face;
      pileList.appendChild(mc);
    });
  }

  // Render blown pile
  const blown=s.blownPile||[];
  const blownEl=document.getElementById('blown-pile');
  if(blownEl){
    blownEl.innerHTML='';
    const showB=Math.min(blown.length,4);
    const angles=[-12,-4,5,14];
    const offsets=[8,5,2,0];
    for(let bi=0;bi<showB;bi++){
      const bc=document.createElement('div');
      bc.className='blown-card';
      bc.style.cssText='bottom:'+offsets[bi]+'px;left:50%;transform:translateX(-50%) rotate('+angles[bi]+'deg);z-index:'+bi+';';
      blownEl.appendChild(bc);
    }
    // Top card (blow trigger) face up
    if(s.blownTop){
      const bt=document.createElement('div');
      bt.className='blown-card'+(isRed(s.blownTop.suit)?' red':'');
      bt.innerHTML='<span class="corner">'+s.blownTop.face+'<br>'+sym(s.blownTop.suit)+'</span><span>'+s.blownTop.face+'</span>';
      bt.style.cssText='bottom:0;left:50%;transform:translateX(-50%) rotate(-2deg);z-index:10;';
      blownEl.appendChild(bt);
    }
    document.getElementById('blown-count').textContent=blown.length+' cards';
  }

  // Turn indicator
  const myTurnNow = !s.turn || s.turn===myH;

  // Render draw deck
  const deckCards=s.deck||[];
  const deckEl=document.getElementById('draw-deck');
  if(deckEl){
    deckEl.innerHTML='';
    const showDeck=Math.min(deckCards.length,3);
    for(let di=0;di<Math.max(showDeck,1);di++){
      const dc=document.createElement('div');
      dc.className='draw-deck-card';
      deckEl.appendChild(dc);
    }
    if(deckCards.length===0) deckEl.classList.add('empty');
    else deckEl.classList.remove('empty');
    document.getElementById('deck-count').textContent=deckCards.length+' left';
    // Show pulse if player needs to draw — allowed even while waiting on
    // opponent, so players aren't stuck staring at a dead screen.
    const myHandNow=s[myH+'Hand']||[];
    const needsDraw=myHandNow.length<3&&deckCards.length>0;
    if(needsDraw) deckEl.classList.add('can-draw');
    else deckEl.classList.remove('can-draw');
    document.getElementById('deck-tap-hint').textContent=needsDraw?'TAP TO DRAW':'';
  }

  localHand=s[myH+'Hand']||[];
  // It's my turn if turn===myH or no turn set
  const isMyTurn = !s.turn || s.turn===myH;
  hasPlayed = !isMyTurn || !!(s[myH+'Played']);
  renderMyHand(s,myH);

  // pickup-wrap now hidden - pile tap handles pickup when no card selected
  const pw=document.getElementById('pickup-wrap');pw.innerHTML='';

  const mi=document.getElementById('multi-info');
  if(selectedIdxs.length>1)mi.textContent='Playing '+selectedIdxs.length+'x '+localHand[selectedIdxs[0]].face;
  else mi.textContent='';

  const myHandNow2=s[myH+'Hand']||[];
  const isMyTurnNow = s.turn ? s.turn===myH : true; // only default to my turn if turn never been set
  let msg='';
  const wo=document.getElementById('waiting-overlay');
  // Show/hide based on turn
  if(!isMyTurnNow && !s.result){
    if(wo) wo.classList.add('show');
  } else {
    if(wo) wo.classList.remove('show');
  }
  // Safety: if waiting but player has cards and it's been a while, re-read Firebase
  if(!isMyTurnNow && !s.result && (s[myH+'Hand']||[]).length>0 && !window._turnCheckPending){
    window._turnCheckPending=true;
    setTimeout(()=>{
      window._turnCheckPending=false;
      if(roomRef) roomRef.once('value', snap=>{
        const fresh=snap.val();
        if(fresh && (fresh.turn===myH || !fresh.turn)){
          renderGame(fresh);
        }
      });
    }, 3000);
  }
  if(s.result){
    msg=s.result;
  } else if(!isMyTurnNow){
    if(myHandNow2.length<3&&(s.deck||[]).length>0){
      msg='Waiting on opponent — you can still draw from the pot.';
    } else {
      msg='';
    }
  } else {
    // msg set below
    if(myHandNow2.length===0&&(s[myH+'Chosen']||[]).length>0&&(s.deck||[]).length===0){
      msg='Pot empty — tap your Chosen deck to pick it up.';
    } else if(myHandNow2.length===0&&(s[myH+'Chosen']||[]).length===0&&(s[myH+'Blind']||[]).length>0){
      msg='Tap your Blind deck to draw one card.';
    } else if(myHandNow2.length<3&&(s.deck||[]).length>0){
      msg='Tap the pot to draw a card.';
    } else if(s.topCard){
      if(!canBeat(myHandNow2, s.topCard)){
        msg='Cannot beat the '+s.topCard.face+' — tap pile to pick it up.';
      } else {
        msg='Beat the '+s.topCard.face+'. Select a card then tap the pile.';
      }
    } else {
      msg='Your turn — select a card then tap the pile.';
    }
  }
  document.getElementById('status-msg').textContent=msg;

  // Only the player whose turn it WAS resolves the round
  // This prevents both clients firing resolveRound simultaneously.
  // iJustPlayed is already scoped to MY OWN played field, so only the
  // client who actually submitted a play ever considers triggering this —
  // safe to also allow the "instant replay" case (played a matching card
  // before the opponent responded), where turn still shows the opponent.
  const iJustPlayed = !!s[myH+'Played'];
  const itWasMyTurn = s.turn === myH;
  const oppHForTrigger = myH==='p1'?'p2':'p1';
  const wasInstantReplay = s.turn === oppHForTrigger;
  if(iJustPlayed && (itWasMyTurn || wasInstantReplay) && !s.result && !resolving){
    resolving=true;
    setTimeout(()=>resolveRound(s), 200);
  }
  // Only show winner - don't write to Firebase from renderGame (causes race conditions)
  if(s.gameOver){
    showWinner(s);
  }
}

function renderMiniStack(elId,count,cls){
  const el=document.getElementById(elId);el.innerHTML='';
  for(let i=0;i<Math.min(count,3);i++){
    const d=document.createElement('div');d.className='mcard '+cls;el.appendChild(d);
  }
}

function makeCardEl(c,showFace,extraClass){
  const el=document.createElement('div');
  el.className='card'+(isRed(c.suit)?' red':'')+(extraClass?' '+extraClass:'');
  if(showFace)el.innerHTML=`<span class="corner">${c.face}<br>${sym(c.suit)}</span><span>${c.face}</span>`;
  return el;
}

function renderMyHand(s,myH){
  const el=document.getElementById('my-hand');el.innerHTML='';
  const oppH = myH==='p1' ? 'p2' : 'p1';
  const isMyTurnNow = s.turn ? s.turn===myH : true;
  // Instant replay: opponent's turn technically started (because I just played),
  // but if I drew a card matching what's on top of the pile and they haven't
  // responded yet, let me play it right away instead of waiting.
  const instantReplayEligible = hasPlayed && !isMyTurnNow && !!s.topCard && !s[oppH+'Played'];
  const canPlay=(!hasPlayed||instantReplayEligible)&&(s.status==='playing'||cpuMode)&&!s.gameOver;
  localHand.forEach((c,i)=>{
    const isSel=selectedIdxs.includes(i);
    const cardMatchesReplay = instantReplayEligible && c.face===s.topCard.face;
    const thisCardPlayable = canPlay && (!hasPlayed || cardMatchesReplay);
    const cardEl=makeCardEl(c,true,(thisCardPlayable?'playable':'')+(isSel?' selected':''));
    if(thisCardPlayable){
      cardEl.onclick=(e)=>{
        if(window.tutorialOn||tutorialOn){
          const rect=cardEl.getBoundingClientRect();
          showTutorialPopup(c, rect.left+rect.width/2, rect.top);
        }
        if(selectedIdxs.length===0){selectedIdxs=[i];}
        else if(isSel){selectedIdxs=selectedIdxs.filter(x=>x!==i);}
        else{
          if(localHand[i].face===localHand[selectedIdxs[0]].face)selectedIdxs.push(i);
          else selectedIdxs=[i];
        }
        document.getElementById('play-btn').disabled=selectedIdxs.length===0;
        renderMyHand(s,myH);
        const mi=document.getElementById('multi-info');
        if(selectedIdxs.length>1)mi.textContent='Playing '+selectedIdxs.length+'x '+localHand[selectedIdxs[0]].face;
        else mi.textContent='';
        const hint=document.getElementById('pile-tap-hint');
        if(hint) hint.textContent=selectedIdxs.length>0?'TAP PILE TO PLAY':'';
      };
    }
    el.appendChild(cardEl);
  });
  document.getElementById('play-btn').disabled=selectedIdxs.length===0||(hasPlayed&&!instantReplayEligible)||!s||s.gameOver;
  // Show tap-pile hint when card selected
  const hint=document.getElementById('pile-tap-hint');
  if(hint){
    hint.textContent=selectedIdxs.length>0&&(!hasPlayed||instantReplayEligible)?'TAP PILE TO PLAY':'';
  }
  const pw=document.getElementById('play-pile-top');
  if(pw){
    if(selectedIdxs.length>0&&(!hasPlayed||instantReplayEligible)) pw.classList.add('ready');
    else pw.classList.remove('ready');
  }
}

function setStatus(msg){ document.getElementById("status-msg").textContent=msg; }









function playSelected(){
  if(selectedIdxs.length===0)return;
  const s=gameState;
  const myH=myRole==='p1'?'p1':'p2';
  const oppH=myRole==='p1'?'p2':'p1';
  resolving=false; // clear any stale resolving state
  // Don't check turn here - onPileTapPvP already validated it with fresh Firebase data
  const cards=selectedIdxs.map(i=>localHand[i]);
  const card=cards[0];
  // Instant replay: if it's technically the opponent's turn (because we just
  // played) but this card matches the rank still sitting on top of the pile
  // and the opponent hasn't responded yet, let it through anyway.
  const isMyTurnNow = s.turn ? s.turn===myH : true;
  const isInstantReplay = !isMyTurnNow && s.topCard && card.face===s.topCard.face && !s[oppH+'Played'];
  if(hasPlayed && !isInstantReplay) return;
  if(s.topCard && card.face!=='2' && card.face!=='10' && card.face!=='3'){
    if(cardRank(card)<cardRank(s.topCard)){
      setStatus('That card does not match or beat the '+s.topCard.face+'.');
      return;
    }
  }
  const newHand=localHand.filter((_,i)=>!selectedIdxs.includes(i));
  // ONLY set Played + update hand — resolveRound handles pile
  const update=myRole==='p1'
    ?{p1Played:cards,p1Hand:newHand}
    :{p2Played:cards,p2Hand:newHand};
  selectedIdxs=[];
  document.getElementById('play-btn').disabled=true;
  const wo=document.getElementById('waiting-overlay');
  if(wo) wo.classList.add('show');
  roomRef.update(update);
  // Win detection handled by resolveRound — don't double-check here
}

function pickupPile(){
  // resolving check removed - player should always be able to pick up on their turn
  const s=gameState;
  const myH=myRole==='p1'?'p1':'p2';
  const oppH=myRole==='p1'?'p2':'p1';
  const isMyTurnNow = s.turn ? s.turn===myH : true; // only default to my turn if turn never been set
  if(!isMyTurnNow) return;
  const pile=s.playPile||[];
  const myN=myRole==='p1'?(s.p1?s.p1.name:'P1'):(s.p2?s.p2.name:'P2');
  const newHand=[...(s[myH+'Hand']||[]),...pile];
  if(pile.length>0) throwCards(pile.slice(-3));
  const update={playPile:[],topCard:null,turn:oppH,
    pickupFlash:Date.now(),
    result:myN+' picks up the pile ('+pile.length+' cards)! Opponent goes next.'};
  update[myH+'Hand']=newHand;
  roomRef.update(update);
  setTimeout(()=>roomRef.update({result:null}),2500);
}

function canBeat(hand, topCard){
  if(!topCard) return true;
  const topRank = cardRank(topCard);
  // 3 is unbeatable — no card can match or beat it except another 3
  if(topCard.face === '3') return hand.some(c=>c.face==='3');
  return hand.some(c => {
    if(c.face === '2') return false;  // 2 is special, not a beater
    if(c.face === '10') return true;  // 10 always blows
    if(c.face === '3') return true;   // 3 beats everything
    return cardRank(c) >= topRank;    // match or beat
  });
}

function resolveRound(s){
  const myH  = myRole==='p1'?'p1':'p2';
  const oppH = myRole==='p1'?'p2':'p1';
  // Only the player who just played triggers resolution (single-card turns)
  // Figure out who just played
  const p1cards = s.p1Played||[];
  const p2cards = s.p2Played||[];
  const p1n = s.p1?s.p1.name:'P1', p2n = s.p2?s.p2.name:'P2';

  // Determine who played — check both, prioritize current turn
  let playedBy=null, playedCards=[], playedCard=null;
  const p1hasPlayed = p1cards && (Array.isArray(p1cards)?p1cards.length>0:true);
  const p2hasPlayed = p2cards && (Array.isArray(p2cards)?p2cards.length>0:true);
  if(p1hasPlayed && s.turn==='p1'){
    playedBy='p1'; playedCards=Array.isArray(p1cards)?p1cards:[p1cards];
  } else if(p2hasPlayed && s.turn==='p2'){
    playedBy='p2'; playedCards=Array.isArray(p2cards)?p2cards:[p2cards];
  } else if(p1hasPlayed){
    playedBy='p1'; playedCards=Array.isArray(p1cards)?p1cards:[p1cards];
  } else if(p2hasPlayed){
    playedBy='p2'; playedCards=Array.isArray(p2cards)?p2cards:[p2cards];
  }
  if(!playedBy || !playedCards.length){ resolving=false; return; }
  playedCard = playedCards[0];
  const playedName = playedBy==='p1'?p1n:p2n;
  const oppName    = playedBy==='p1'?p2n:p1n;

  const pile = s.playPile||[];
  const blown = s.blownPile||[];
  const np = [...pile, ...playedCards];

  function clearPlayed(extra){
    return Object.assign({p1Played:null, p2Played:null}, extra);
  }

  function finishBlow(blowCard, blowReason){
    const newBlown = [...blown, ...np];
    throwCards(playedCards);
    const blowDesc = playedCards.length>1 ? playedCards.length+'x '+playedCard.face : playedCard.face+sym(playedCard.suit);
    // A blow means go again — UNLESS that play emptied the player's hand/chosen/blind entirely, which is a win.
    const update = clearPlayed({
      playPile:[], topCard:null,
      blownPile: newBlown, blownTop: blowCard,
      lastPlayedBy: playedBy,
      lastPlayedDesc: blowDesc,
      turn: playedBy,
      result: blowReason||playedName+' blew the pile — go again!'
    });
    update.blowFlash = Date.now();
    // s.p1Hand/s.p2Hand already exclude played cards (playSelected wrote newHand before this ran)
    const p1t=(s.p1Hand||[]).length+(s.p1Chosen||[]).length+(s.p1Blind||[]).length;
    const p2t=(s.p2Hand||[]).length+(s.p2Chosen||[]).length+(s.p2Blind||[]).length;
    if(p1t<=0){ update.gameOver=true; update.winner='p1'; }
    else if(p2t<=0){ update.gameOver=true; update.winner='p2'; }
    resolving=false;
    roomRef.update(update);
    setTimeout(()=>{ roomRef.update({result:null}); }, 2000);
  }

  // ── 10 = auto blow (check BEFORE 4-of-a-kind)
  if(playedCard.face==='10'){
    finishBlow(playedCard);
    return;
  }

  // ── 2 = player goes again, pile resets — checked BEFORE 4-of-a-kind
  // 2 is NEVER a blow trigger and never counts toward 4-of-a-kind
  if(playedCard.face==='2'){
    // A 2 means go again — UNLESS that play emptied the player's hand/chosen/blind entirely, which is a win.
    const update = clearPlayed({
      playPile: np, topCard: playedCard,
      turn: playedBy,
      lastPlayedBy: playedBy,
      lastPlayedDesc: '2',
      result: playedName+' played a 2 — goes again!'
    });
    const p1t=(s.p1Hand||[]).length+(s.p1Chosen||[]).length+(s.p1Blind||[]).length;
    const p2t=(s.p2Hand||[]).length+(s.p2Chosen||[]).length+(s.p2Blind||[]).length;
    if(p1t<=0){ update.gameOver=true; update.winner='p1'; }
    else if(p2t<=0){ update.gameOver=true; update.winner='p2'; }
    resolving=false;
    roomRef.update(update);
    setTimeout(()=>{ roomRef.update({result:null}); }, 1500);
    return;
  }

  // ── 4 of a kind: all 4 of same face in pile = blow
  // Only check last 4 cards for quad — must be consecutive same-number plays
  const last4=np.slice(-4);
  const faceCount={};
  last4.forEach(c=>{ faceCount[c.face]=(faceCount[c.face]||0)+1; });
  const quadFace=Object.keys(faceCount).find(f=>faceCount[f]>=4);
  if(quadFace){
    // Update result to explain the blow
    const blowReason = quadFace===playedCard.face ? 
      '4x '+quadFace+' — BLOWN AWAY!' : 
      'Four '+quadFace+'s in the pile — BLOWN AWAY!';
    finishBlow({face:quadFace, suit:playedCard.suit}, blowReason);
    return;
  }

  // ── Normal: card lands on pile, always switch to opponent's turn
  const nextTurn = playedBy==='p1'?'p2':'p1'; // always explicit, never null
  const cardDesc = playedCards.length>1 ? playedCards.length+'x '+playedCard.face+' ('+playedCards.map(c=>c.face+sym(c.suit)).join(', ')+')' : playedCard.face+sym(playedCard.suit);
  const update = clearPlayed({
    playPile: np, topCard: playedCard,
    turn: nextTurn,
    lastPlayedBy: playedBy,
    lastPlayedDesc: cardDesc,
    result: playedName+' played '+cardDesc+'. '+oppName+' must match or beat it.'
  });
  // Check win — s.p1Hand already excludes played cards (playSelected wrote newHand)
  // Don't subtract again — that causes false wins
  const p1t=(s.p1Hand||[]).length+(s.p1Chosen||[]).length+(s.p1Blind||[]).length;
  const p2t=(s.p2Hand||[]).length+(s.p2Chosen||[]).length+(s.p2Blind||[]).length;
  if(p1t<=0){
    update.gameOver=true; update.winner='p1';
    update.turn='p2'; // explicit turn even on win
  } else if(p2t<=0){
    update.gameOver=true; update.winner='p2';
    update.turn='p1';
  }
  resolving=false; // clear immediately — Firebase write handles the lock via result field
  roomRef.update(update);
  setTimeout(()=>{ roomRef.update({result:null}); }, 1500);
}

function checkWinState(s){
  if(s.gameOver) return;
  const p1t=totalCards(s,'p1'), p2t=totalCards(s,'p2');
  if(p1t===0) roomRef.update({gameOver:true, winner:'p1'});
  else if(p2t===0) roomRef.update({gameOver:true, winner:'p2'});
}

function throwCards(cards){
  cards.forEach(card=>{
    const fly=document.createElement('div');
    fly.className='flying-card'+(isRed(card.suit)?' red':'');
    fly.style.left=(window.innerWidth/2-25)+'px';
    fly.style.top=(window.innerHeight/2-35)+'px';
    fly.innerHTML=`<span style="position:absolute;top:2px;left:3px;font-size:8px;line-height:1.2;font-weight:700;">${card.face}<br>${sym(card.suit)}</span><span>${card.face}</span>`;
    document.body.appendChild(fly);
    const dx=(Math.random()-0.5)*700,dy=(Math.random()-0.5)*500-100,rot=(Math.random()-0.5)*720;
    fly.animate([
      {transform:'translate(0,0) rotate(0deg)',opacity:1},
      {transform:`translate(${dx}px,${dy}px) rotate(${rot}deg)`,opacity:0}
    ],{duration:900,easing:'cubic-bezier(0.15,0,1,0.85)',fill:'forwards'});
    setTimeout(()=>fly.remove(),960);
  });
}

const _badWords=['nigger','nigga','chink','spic','kike','faggot','retard','cunt','fuck','shit','bitch','ass'];
function filterChat(msg){
  let out=msg;
  _badWords.forEach(w=>{
    const rx=new RegExp('\\b'+w+'\\w*','gi');
    out=out.replace(rx, m=>'*'.repeat(m.length));
  });
  return out;
}

function sendChat(){
  const inp=document.getElementById('chat-input');
  const msg=inp.value.trim();if(!msg||!roomCode)return;
  inp.value='';
  const filtered=filterChat(msg);
  db.ref('chats/'+roomCode).push({name:myName,role:myRole,text:filtered,ts:Date.now()});
}

function appendChatMsg(data){
  const el=document.getElementById('chat-messages');
  const div=document.createElement('div');
  div.className='chat-msg'+(data.role===myRole?' mine':'');
  div.innerHTML=`<span class="chat-name">${data.name}:</span>${escHtml(data.text)}`;
  el.appendChild(div);el.scrollTop=el.scrollHeight;
}

function escHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}



function showBigFlash(msg, type){
  const el=document.getElementById('big-flash');
  const txt=document.getElementById('big-flash-text');
  if(!el||!txt) return;
  txt.textContent=msg;
  txt.className=type;
  el.classList.add('show');
  setTimeout(()=>{ el.classList.remove('show'); },1900);
}



// restartGame — see lobby override below

// Add tutorial popup on card tap — patch renderMyHand
function renderMyHandWithTutorial(s, myH){
  renderMyHand(s, myH);
  if(!tutorialOn) return;
  // Add tap listener for tutorial on each card
  const cards=document.querySelectorAll('#my-hand .card.playable');
  cards.forEach((el,i)=>{
    const orig=el.onclick;
    el.addEventListener('touchstart', (e)=>{
      const touch=e.touches[0];
      const localCard=localHand[el.dataset.idx!==undefined?parseInt(el.dataset.idx):i];
      if(localCard) showTutorialPopup(localCard, touch.clientX, touch.clientY);
    }, {passive:true});
  });
}


// ============================================================
// ANIMATED LOBBY
// ============================================================
const AVATARS = ['avatar-wooch.png','avatar-phantom.png','avatar-femme-fatale.png','avatar-highroller.png','avatar-bartender.png','avatar-biker.png','avatar-punk.png','avatar-hustler.png'];
const AVATAR_NAMES = {
  'avatar-wooch.png': 'Wooch',
  'avatar-phantom.png': 'Phantom',
  'avatar-femme-fatale.png': 'Roxie',
  'avatar-highroller.png': 'Vinny Vegas',
  'avatar-bartender.png': 'Inkwell',
  'avatar-biker.png': 'Diesel',
  'avatar-punk.png': 'Riot',
  'avatar-hustler.png': 'Big Sal'
};
const COLORS = ['#e53935','#1565C0','#2e7d32','#f57f17','#6a1b9a','#00838f','#4e342e','#37474f'];
var selectedAvatar = AVATARS[0]; // var, not let — profiles.js reads/writes this via window.selectedAvatar
var selectedColor = COLORS[0];   // same here
let lobbyRole = null; // 'host' or 'guest'
let lobbyChatRef = null;

// Showcase carousel: one big featured portrait, peek cards on either side,
// name displayed underneath. Tap a card or swipe to change the pick.
function initAvatarPicker(){
  const row = document.getElementById('avatar-carousel');
  if(!row){ setTimeout(initAvatarPicker, 200); return; }
  row.innerHTML = '';
  const spacerL = document.createElement('div');
  spacerL.className = 'avatar-spacer';
  row.appendChild(spacerL);
  AVATARS.forEach(av=>{
    const el = document.createElement('div');
    el.className = 'avatar-card' + (av===selectedAvatar?' active':'');
    el.style.backgroundImage = "url('./"+av+"')";
    el.dataset.avatar = av;
    el.onclick = ()=> selectAvatarCard(av, true);
    row.appendChild(el);
  });
  const spacerR = document.createElement('div');
  spacerR.className = 'avatar-spacer';
  row.appendChild(spacerR);

  const nameEl = document.getElementById('avatar-name-display');
  if(nameEl) nameEl.textContent = AVATAR_NAMES[selectedAvatar] || '';

  let scrollTimeout;
  row.addEventListener('scroll', ()=>{
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(updateActiveFromScroll, 90);
  });

  requestAnimationFrame(()=> scrollToAvatar(selectedAvatar, false));
}

function selectAvatarCard(av, doScroll){
  selectedAvatar = av;
  document.querySelectorAll('.avatar-card').forEach(el=>{
    el.classList.toggle('active', el.dataset.avatar===av);
  });
  const nameEl = document.getElementById('avatar-name-display');
  if(nameEl) nameEl.textContent = AVATAR_NAMES[av] || '';
  if(doScroll) scrollToAvatar(av, true);
  updateP1Avatar();
}

function scrollToAvatar(av, smooth){
  const row = document.getElementById('avatar-carousel');
  if(!row) return;
  const card = row.querySelector('.avatar-card[data-avatar="'+av+'"]');
  if(!card) return;
  const target = card.offsetLeft - (row.clientWidth - card.clientWidth)/2;
  row.scrollTo({left: target, behavior: smooth?'smooth':'auto'});
}

function updateActiveFromScroll(){
  const row = document.getElementById('avatar-carousel');
  if(!row) return;
  const cards = row.querySelectorAll('.avatar-card');
  const rowRect = row.getBoundingClientRect();
  const centerX = rowRect.left + rowRect.width/2;
  let closest=null, closestDist=Infinity;
  cards.forEach(c=>{
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width/2;
    const d = Math.abs(cx-centerX);
    if(d<closestDist){ closestDist=d; closest=c; }
  });
  if(closest && closest.dataset.avatar!==selectedAvatar){
    selectAvatarCard(closest.dataset.avatar, false);
  }
}

// Avatars are now portrait images (filename ending .png); '?' is the empty-seat placeholder.
function renderAvatarInto(el, avatar, color){
  if(!el) return;
  const isImg = typeof avatar === 'string' && avatar.indexOf('.png') !== -1;
  if(isImg){
    el.style.backgroundImage = "url('./"+avatar+"')";
    el.textContent = '';
  } else {
    el.style.backgroundImage = 'none';
    el.style.backgroundColor = color || 'rgba(10,20,40,0.8)';
    el.textContent = avatar || '?';
  }
}

function updateP1Avatar(){
  const av = document.getElementById('avatar-p1');
  if(av){ renderAvatarInto(av, selectedAvatar, selectedColor); av.classList.add('occupied'); }
}

function goToModeSelect(){
  myName = document.getElementById('player-name-input').value.trim();
  if(!myName){ document.getElementById('lobby-status').textContent='Enter your name first.'; return; }
  document.getElementById('lobby-status').textContent='';
  // Profile hook: first-time visitors set up a profile (with optional PIN) before entering.
  // Returning visitors just get their name/avatar/color synced. See profiles.js.
  if(typeof onEnterBarProfileCheck === 'function'){
    onEnterBarProfileCheck(myName, selectedAvatar, selectedColor, proceedToModeSelect);
  } else {
    proceedToModeSelect();
  }
}

function proceedToModeSelect(){
  document.getElementById('lobby-screen-1').style.display='none';
  document.getElementById('lobby-screen-2').style.display='block';

  // Show player in left seat
  setLobbyAvatar('p1', selectedAvatar, selectedColor, myName, '');

  // Show mode controls
  document.getElementById('host-controls').style.display='none';
  document.getElementById('guest-controls').style.display='none';
  document.getElementById('join-controls').style.display='block';
  document.getElementById('waiting-msg').textContent='Create a room or enter a code to join.';

  // Add Create Room button dynamically if not present
  if(!document.getElementById('create-room-lobby-btn')){
    const btn = document.createElement('button');
    btn.id = 'create-room-lobby-btn';
    btn.className = 'btn-plaque';
    btn.textContent = 'Create room';
    btn.onclick = createRoom;
    document.getElementById('join-controls').prepend(btn);
  }

  initLobbyChat();
}

function backToScreen1(){
  document.getElementById('lobby-screen-2').style.display='none';
  document.getElementById('lobby-screen-1').style.display='block';
  if(roomRef){ try{roomRef.off();}catch(e){} roomRef=null; }
  roomCode=null; myRole=null;
  setLobbyAvatar('p2','?','rgba(10,20,40,0.8)','Empty seat','');
}

function setLobbyAvatar(side, avatar, color, name, status){
  const avEl = document.getElementById('avatar-'+side);
  const nmEl = document.getElementById('seatname-'+side);
  const stEl = document.getElementById('seatstatus-'+side);
  if(avEl){ renderAvatarInto(avEl, avatar, color); avEl.classList.toggle('occupied', avatar!=='?'); }
  if(nmEl) nmEl.textContent = name;
  if(stEl) stEl.textContent = status;
}

function copyRoomCode(){
  if(!roomCode) return;
  // Try clipboard API first, fall back to execCommand
  const doCopy = () => {
    const el=document.createElement('textarea');
    el.value=roomCode;
    el.style.cssText='position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(el);
    el.focus(); el.select();
    try{ document.execCommand('copy'); }catch(e){}
    document.body.removeChild(el);
    const btn=document.getElementById('copy-btn');
    if(btn){ const orig=btn.textContent; btn.textContent='✓ COPIED!'; setTimeout(()=>btn.textContent=orig,2000); }
  };
  if(navigator.clipboard){
    navigator.clipboard.writeText(roomCode).then(()=>{
      const btn=document.getElementById('copy-btn');
      if(btn){ const orig=btn.textContent; btn.textContent='✓ COPIED!'; setTimeout(()=>btn.textContent=orig,2000); }
    }).catch(doCopy);
  } else { doCopy(); }
}

function showLobbyRoom(code, isHost){
  document.getElementById('room-code-sign').style.display='block';
  document.getElementById('room-code-text').textContent=code;
  document.getElementById('host-controls').style.display=isHost?'block':'none';
  document.getElementById('guest-controls').style.display=isHost?'none':'block';
  document.getElementById('join-controls').style.display='none';
  const crBtn=document.getElementById('create-room-lobby-btn');
  if(crBtn) crBtn.style.display='none';
}

function toggleReady(isReady){
  if(!roomRef) return;
  roomRef.child('p2Ready').set(isReady);
  const av=document.getElementById('avatar-p2');
  if(av){ if(isReady) av.classList.add('ready-glow'); else av.classList.remove('ready-glow'); }
  document.getElementById('seatstatus-p2').textContent=isReady?'✓ READY':'';
}

function hostStartGame(){
  if(!roomRef) return;
  dealInitial();
}

function startCPUGameFromLobby(){
  document.getElementById('cpu-name') || (() => {
    const inp = document.createElement('input');
    inp.id='cpu-name'; inp.type='text'; inp.style.display='none';
    inp.value=myName||'Player';
    document.body.appendChild(inp);
  })();
  if(myName) document.getElementById('cpu-name').value=myName;
  document.getElementById('lobby-screen-2').style.display='none';
  document.getElementById('lobby-screen-1').style.display='none';
  startCPUGame();
}

// Lobby chat
function initLobbyChat(){
  if(!roomCode||lobbyChatRef) return;
  lobbyChatRef=db.ref('lobbychat/'+roomCode);
  lobbyChatRef.on('child_added', snap=>{
    const d=snap.val();
    const el=document.getElementById('lobby-chat-messages');
    if(!el) return;
    const div=document.createElement('div');
    div.style.cssText='margin-bottom:3px;';
    div.innerHTML=`<span style="color:var(--blue-light);font-family:Oswald,sans-serif;font-size:10px;">${d.name}:</span> <span style="font-size:11px;">${escHtml(d.text)}</span>`;
    el.appendChild(div);
    el.scrollTop=el.scrollHeight;
  });
}

function sendLobbyChat(){
  const inp=document.getElementById('lobby-chat-input');
  if(!inp||!inp.value.trim()||!roomCode) return;
  if(!lobbyChatRef) initLobbyChat();
  const filtered=filterChat(inp.value.trim());
  if(lobbyChatRef) lobbyChatRef.push({name:myName,text:filtered,ts:Date.now()});
  inp.value='';
}

// ── Override createRoom to use new lobby UI ──
async function createRoom(){
  if(!myName) myName=document.getElementById('player-name-input').value.trim()||document.getElementById('create-name')?.value.trim()||'';
  if(!myName){ document.getElementById('lobby-status').textContent='Enter your name.'; return; }
  if(!db){ document.getElementById('lobby-status').textContent='Connecting... try again.'; return; }
  try{
    if(roomRef){ try{roomRef.off();}catch(e){} }
    roomCode=genCode(); myRole='p1'; lobbyRole='host';
    roomRef=db.ref('rooms/'+roomCode);
    await roomRef.set({
      p1:{name:myName,avatar:selectedAvatar,color:selectedColor},
      p2:null, status:'waiting', p2Ready:false
    });
    showLobbyRoom(roomCode, true);
    setLobbyAvatar('p1',selectedAvatar,selectedColor,myName,'HOST');
    document.getElementById('waiting-msg').textContent='Share the code — waiting for opponent...';
    document.getElementById('deal-btn').disabled=true;

    roomRef.child('p2').on('value',snap=>{
      const p2=snap.val();
      if(p2&&p2.name){
        setLobbyAvatar('p2',p2.avatar||'🃏',p2.color||'#1565C0',p2.name,'');
        document.getElementById('waiting-msg').textContent=p2.name+' pulled up!';
        roomRef.child('p2Ready').set(true);
        initLobbyChat();
      }
    });
    roomRef.child('p2Ready').on('value',snap=>{
      const ready=snap.val();
      const dealBtn=document.getElementById('deal-btn');
      const p2av=document.getElementById('avatar-p2');
      if(ready){
        if(dealBtn){ dealBtn.disabled=false; dealBtn.style.opacity='1'; }
        if(p2av) p2av.classList.add('ready-glow');
        document.getElementById('seatstatus-p2').textContent='✓ READY';
        document.getElementById('waiting-msg').textContent='Opponent is ready! Deal em!';
      } else {
        if(dealBtn){ dealBtn.disabled=true; dealBtn.style.opacity='0.4'; }
        if(p2av) p2av.classList.remove('ready-glow');
        document.getElementById('seatstatus-p2').textContent='';
      }
    });
    roomRef.child('status').on('value',snap=>{
      const status=snap.val();
      if(!status||status==='waiting') return;
      if(status==='setup'){ setTimeout(()=>roomRef.once('value',s=>{ if(s.val()) enterSetup(s.val()); }),300); }
      if(status==='playing'){ setTimeout(()=>roomRef.once('value',s=>{ if(s.val()) enterGame(s.val()); }),300); }
    });
  } catch(err){
    document.getElementById('lobby-status').textContent='Error: '+err.message;
  }
}

// ── Override joinRoom to use new lobby UI ──
async function joinRoom(){
  if(!myName) myName=document.getElementById('player-name-input').value.trim()||'';
  const codeEl=document.getElementById('join-code');
  const code=codeEl?codeEl.value.trim().toUpperCase():'';
  if(!myName){ document.getElementById('lobby-status').textContent='Enter your name.'; return; }
  if(!code){ document.getElementById('lobby-status').textContent='Enter a room code.'; return; }
  if(!db){ document.getElementById('lobby-status').textContent='Connecting... try again.'; return; }
  const snap=await db.ref('rooms/'+code).get();
  if(!snap.exists()){ document.getElementById('lobby-status').textContent='Room not found.'; return; }
  if(snap.val().status!=='waiting'){ document.getElementById('lobby-status').textContent='Game already started.'; return; }
  myRole='p2'; roomCode=code; lobbyRole='guest';
  roomRef=db.ref('rooms/'+roomCode);
  await roomRef.child('p2').set({name:myName,avatar:selectedAvatar,color:selectedColor});
  showLobbyRoom(roomCode, false);
  const s=snap.val();
  const p1=s.p1||{};
  setLobbyAvatar('p1',p1.avatar||'💀',p1.color||'#e53935',p1.name||'Host','HOST');
  setLobbyAvatar('p2',selectedAvatar,selectedColor,myName,'');
  document.getElementById('waiting-msg').textContent='Waiting for host to deal...';
  initLobbyChat();
  roomRef.child('status').on('value',snap=>{
    const status=snap.val();
    if(!status||status==='waiting') return;
    if(status==='setup'){ setTimeout(()=>roomRef.once('value',s=>{ if(s.val()) enterSetup(s.val()); }),300); }
    if(status==='playing'){ setTimeout(()=>roomRef.once('value',s=>{ if(s.val()) enterGame(s.val()); }),300); }
  });
}

// ── Post-game return to lobby ──
function restartGame(){
  if(cpuMode){ restartGameCPU(); return; }
  document.getElementById('winner-overlay').classList.remove('show');
  stopWinnerVideo();
  document.getElementById('game').style.display='none';
  document.getElementById('quit-btn-wrap').style.display='none';
  document.getElementById('rules-btn').style.display='none';
  gameListening=false; resolving=false; setupEntered=false;
  selectedIdxs=[]; setupSelectedIdxs=[];
  // Return to bar lobby screen 2 if we have a room
  if(roomCode&&roomRef){
    document.getElementById('lobby').style.display='block';
    document.getElementById('lobby-screen-1').style.display='none';
    document.getElementById('lobby-screen-2').style.display='block';
    // Reset ready state
    if(myRole==='p2') roomRef.child('p2Ready').set(false);
    const rt=document.getElementById('ready-toggle');
    if(rt) rt.checked=false;
    const p2av=document.getElementById('avatar-p2');
    if(p2av) p2av.classList.remove('ready-glow');
    document.getElementById('seatstatus-p2').textContent='';
    document.getElementById('waiting-msg').textContent=myRole==='p1'?'Opponent must ready up to play again.':'Toggle ready when you want to play again.';
    if(myRole==='p1'){
      roomRef.update({status:'waiting',gameOver:false,p2Ready:false});
      const dealBtn=document.getElementById('deal-btn');
      if(dealBtn){ dealBtn.disabled=true; dealBtn.style.opacity='0.4'; }
    }
  } else {
    location.reload();
  }
}

// Init avatar picker on load
document.addEventListener("DOMContentLoaded", function(){
  if(typeof initProfile === 'function') initProfile();
});

// renderMyHandWithTutorial wraps renderMyHand with tutorial support

// ============================================================
// VS CPU MODE
// ============================================================
function startCPUGame(){
  myName = myName || (document.getElementById('cpu-name')||{}).value || 'Player';
  if(!myName){ myName='Player'; }
  cpuMode=true; myRole='p1';
  tutorialOn=localStorage.getItem('3fs-tutorial')==='1';
  if(typeof resetStatsGuard==='function') resetStatsGuard();

  document.getElementById('lobby').style.display='none';
  document.getElementById('setup').style.display='none';
  document.getElementById('game').style.display='block';
  document.getElementById('quit-btn-wrap').style.display='block';
  
  const cb=document.getElementById('cpu-badge'); if(cb) cb.style.display='block';
  const rl=document.getElementById('room-label'); if(rl) rl.textContent='VS CPU';

  const deck=buildDeck();
  const p1Hand=[],p2Hand=[],p1Blind=[],p2Blind=[];
  for(let i=0;i<10;i++){p1Hand.push(deck.pop());p2Hand.push(deck.pop());}
  for(let i=0;i<3;i++){p1Blind.push(deck.pop());p2Blind.push(deck.pop());}

  // CPU auto-picks 3 best chosen cards
  const sorted=[...p2Hand].sort((a,b)=>cardRank(b)-cardRank(a));
  const p2Chosen=sorted.slice(0,3);
  const p2Remaining=p2Hand.filter(c=>!p2Chosen.find(x=>x.face===c.face&&x.suit===c.suit));

  cpuState={
    p1:{name:myName,avatar:selectedAvatar}, p2:{name:'CPU'},
    p1Hand, p1Blind, p1Chosen:null,
    p2Hand:p2Remaining, p2Blind, p2Chosen,
    deck, playPile:[], topCard:null,
    blownPile:[], blownTop:null,
    turn:null, gameOver:false,
    lastPlayedBy:null, lastPlayedDesc:null,
    status:'setup'
  };
  enterCPUSetup();
}

function enterCPUSetup(){
  setupEntered=false;
  document.getElementById('lobby').style.display='none';
  document.getElementById('game').style.display='none';
  document.getElementById('setup').style.display='block';
  setupHand=[...cpuState.p1Hand];
  setupSelectedIdxs=[];
  renderSetup();
  document.getElementById('setup-status').textContent='Pick your 3 best cards for your chosen deck.';
}

function renderCPUGame(){
  const s=cpuState; if(!s) return;
  document.getElementById('name-p1').textContent='You';
  document.getElementById('name-p2').textContent='CPU';
  document.getElementById('cnt-p1').textContent=(s.p1Hand||[]).length+(s.p1Chosen||[]).length+(s.p1Blind||[]).length;
  document.getElementById('cnt-p2').textContent=(s.p2Hand||[]).length+(s.p2Chosen||[]).length+(s.p2Blind||[]).length;
  document.getElementById('opp-label').textContent='CPU';
  

  renderMiniStack('opp-blind-stack',(s.p2Blind||[]).length,'blind-back');
  renderMiniStack('opp-chosen-stack',(s.p2Chosen||[]).length,'chosen-back');
  renderMiniStack('my-blind-stack',(s.p1Blind||[]).length,'blind-back');
  renderMiniStack('my-chosen-stack',(s.p1Chosen||[]).length,'chosen-back');
  document.getElementById('opp-blind-count').textContent=(s.p2Blind||[]).length;
  document.getElementById('opp-chosen-count').textContent=(s.p2Chosen||[]).length;
  document.getElementById('my-blind-count').textContent=(s.p1Blind||[]).length;
  document.getElementById('my-chosen-count').textContent=(s.p1Chosen||[]).length;

  const oh=document.getElementById('opp-hand'); oh.innerHTML='';
  (s.p2Hand||[]).forEach(()=>{ const el=document.createElement('div'); el.className='card face-down'; el.style.cssText='width:28px;height:40px;'; oh.appendChild(el); });

  const pile=s.playPile||[];
  const pTop=document.getElementById('play-pile-top');
  pTop.innerHTML=''; pTop.className='pile-wrapper';
  if(!s.topCard){ const e=document.createElement('div'); e.className='pile-card empty-pile'; pTop.appendChild(e); }
  else {
    const sc=Math.min(pile.length,4);
    for(let pi=0;pi<sc;pi++){ const bc=document.createElement('div'); bc.className='pile-card pile-face-down'; bc.style.cssText='bottom:'+(( sc-1-pi)*4+20)+'px;transform:translateX(-50%) rotate('+(pi%2===0?-1:1)*(pi*1.5)+'deg);z-index:'+pi+';'; pTop.appendChild(bc); }
    const te=document.createElement('div');
    te.className='pile-card pile-top-card'+(isRed(s.topCard.suit)?' red':'');
    te.innerHTML='<span class="corner">'+s.topCard.face+'<br>'+sym(s.topCard.suit)+'</span><span>'+s.topCard.face+'</span>';
    te.style.cssText='bottom:0;transform:translateX(-50%) rotate(0deg);z-index:10;';
    pTop.appendChild(te);
  }
  document.getElementById('play-pile-count').textContent=pile.length+' card'+(pile.length!==1?'s':'');

  const pl=document.getElementById('pile-cards-list');
  if(pl){ pl.innerHTML=''; pile.forEach(c=>{ const mc=document.createElement('div'); mc.className='pile-mini-card'+(isRed(c.suit)?' red':''); mc.innerHTML='<span class="mcorner">'+c.face+'</span>'+c.face; pl.appendChild(mc); }); }

  const blown=s.blownPile||[];
  const be=document.getElementById('blown-pile');
  if(be){
    be.innerHTML='';
    const angles=[-12,-4,5,14],offsets=[8,5,2,0];
    for(let bi=0;bi<Math.min(blown.length,4);bi++){ const bc=document.createElement('div'); bc.className='blown-card'; bc.style.cssText='bottom:'+offsets[bi]+'px;left:50%;transform:translateX(-50%) rotate('+angles[bi]+'deg);z-index:'+bi+';'; be.appendChild(bc); }
    if(s.blownTop){ const bt=document.createElement('div'); bt.className='blown-card'+(isRed(s.blownTop.suit)?' red':''); bt.innerHTML='<span class="corner">'+s.blownTop.face+'<br>'+sym(s.blownTop.suit)+'</span><span>'+s.blownTop.face+'</span>'; bt.style.cssText='bottom:0;left:50%;transform:translateX(-50%) rotate(-2deg);z-index:10;'; be.appendChild(bt); }
    document.getElementById('blown-count').textContent=blown.length+' cards';
  }

  const deckEl=document.getElementById('draw-deck');
  if(deckEl){
    deckEl.innerHTML='';
    for(let di=0;di<Math.min((s.deck||[]).length,3);di++){ const dc=document.createElement('div'); dc.className='draw-deck-card'; deckEl.appendChild(dc); }
    if(!(s.deck||[]).length) deckEl.classList.add('empty'); else deckEl.classList.remove('empty');
    document.getElementById('deck-count').textContent=(s.deck||[]).length+' left';
  }

  localHand=s.p1Hand||[];
  const isMyTurn=s.turn==='p1';
  hasPlayed=!isMyTurn;
  // Always pass fresh cpuState to ensure status is correct
  const renderState=Object.assign({},s,{status:'playing'});
  renderMyHand(renderState,'p1');

  const myHandNow=s.p1Hand||[], myChosenNow=s.p1Chosen||[], myBlindNow=s.p1Blind||[];
  const potEmpty=(s.deck||[]).length===0;
  const ch=document.getElementById('chosen-tap-hint'),bh=document.getElementById('blind-tap-hint');
  if(ch) ch.textContent=(myHandNow.length===0&&myChosenNow.length>0&&potEmpty)?'TAP TO PICK UP':'';
  if(bh) bh.textContent=(myHandNow.length===0&&myChosenNow.length===0&&myBlindNow.length>0)?'TAP FOR BLIND CARD':'';
  const cs=document.getElementById('my-chosen-stack'),bs=document.getElementById('my-blind-stack');
  if(cs){ if(myHandNow.length===0&&myChosenNow.length>0&&potEmpty) cs.classList.add('can-draw'); else cs.classList.remove('can-draw'); }
  if(bs){ if(myHandNow.length===0&&myChosenNow.length===0&&myBlindNow.length>0) bs.classList.add('can-draw'); else bs.classList.remove('can-draw'); }

  const lm=document.getElementById('last-played-msg');
  if(lm){
    const pileOpenCpu = !(s.playPile && s.playPile.length);
    if(pileOpenCpu){ lm.textContent='Pile is open — play any card!'; }
    else if(s.lastPlayedBy==='p2'&&s.lastPlayedDesc) lm.textContent='CPU played: '+s.lastPlayedDesc;
    else if(s.lastPlayedBy==='p1') lm.textContent='';
  }

  // No waiting overlay in CPU mode - just use status message
  const wo=document.getElementById('waiting-overlay');
  if(wo) wo.classList.remove('show');

  let msg='';
  const deckCards=s.deck||[];
  if(s.result){ msg=s.result; }
  else if(s.turn==='p2'){ msg=''; }
  else if(myHandNow.length===0&&myChosenNow.length>0&&potEmpty){ msg='Pot empty — tap Chosen deck.'; }
  else if(myHandNow.length===0&&myChosenNow.length===0&&myBlindNow.length>0){ msg='Tap Blind deck to draw.'; }
  else if(myHandNow.length<3&&deckCards.length>0){ msg='Tap pot to draw.'; }
  else if(s.topCard){ if(!canBeat(myHandNow,s.topCard)) msg='Cannot beat '+s.topCard.face+' — tap pile to pick up.'; else msg='Beat the '+s.topCard.face+'. Select card then tap pile.'; }
  else { msg='YOUR TURN — tap a card, then tap the pile to play it.'; }
  document.getElementById('status-msg').textContent=msg;
  if(s.gameOver) showWinner(s);
}

function scheduleCPUTurn(){
  if(!cpuMode||cpuState.turn!=='p2'||cpuState.gameOver) return;
  cpuThinkTimeout=setTimeout(()=>{
    // Don't interrupt if player somehow got control
    if(cpuState.turn!=='p2') return;
    executeCPUTurn();
  }, 800+Math.random()*1200);
}

function executeCPUTurn(){
  const s=cpuState;
  if(!s||s.turn!=='p2'||s.gameOver) return;
  let cpuHand=[...(s.p2Hand||[])];
  const pile=[...(s.playPile||[])], blown=[...(s.blownPile||[])];
  const topCard=s.topCard;

  if(cpuHand.length===0){
    const chosen=[...(s.p2Chosen||[])], blind=[...(s.p2Blind||[])], deck=[...(s.deck||[])];
    if(deck.length>0){ cpuHand.push(deck.pop()); cpuState.p2Hand=cpuHand; cpuState.deck=deck; renderCPUGame(); setTimeout(()=>executeCPUTurn(),500); return; }
    else if(chosen.length>0){ cpuState.p2Hand=chosen; cpuState.p2Chosen=[]; renderCPUGame(); setTimeout(()=>executeCPUTurn(),600); return; }
    else if(blind.length>0){ const ri=Math.floor(Math.random()*blind.length); const drawn=blind.splice(ri,1)[0]; cpuState.p2Hand=[drawn]; cpuState.p2Blind=blind; renderCPUGame(); setTimeout(()=>executeCPUTurn(),600); return; }
    else { cpuState.gameOver=true; cpuState.winner='p2'; renderCPUGame(); return; }
  }

  const deck=[...(s.deck||[])];
  if(cpuHand.length<3&&deck.length>0){ while(cpuHand.length<3&&deck.length>0) cpuHand.push(deck.pop()); cpuState.p2Hand=cpuHand; cpuState.deck=deck; }

  if(topCard&&!canBeat(cpuHand,topCard)){
    cpuState.p2Played=true;
    cpuState.p2Hand=[...cpuHand,...pile]; cpuState.playPile=[]; cpuState.topCard=null; cpuState.turn='p1';
    cpuState.result='CPU picks up the pile ('+pile.length+' cards)!';
    cpuState.lastPlayedBy='p2'; cpuState.lastPlayedDesc='picked up pile';
    showBigFlash('PICK IT UP','pickup');
    renderCPUGame(); setTimeout(()=>{ cpuState.result=null; renderCPUGame(); },2000); return;
  }

  const card=cpuChooseCard(cpuHand,topCard,s);
  if(!card){ cpuState.turn='p1'; renderCPUGame(); return; }
  cpuState.p2Played=true;

  const newHand=cpuHand.filter(c=>!(c.face===card.face&&c.suit===card.suit));
  const newPile=[...pile,card];
  const cardDesc=card.face+sym(card.suit);

  if(card.face==='10'){
    const nb=[...blown,...newPile]; cpuState.playPile=[]; cpuState.topCard=null; cpuState.blownPile=nb; cpuState.blownTop=card;
    cpuState.p2Hand=newHand; cpuState.lastPlayedBy='p2'; cpuState.lastPlayedDesc=cardDesc;
    cpuState.result='CPU played a 10 — BLOWN AWAY!'; cpuState.turn='p2';
    showBigFlash('BLOWN AWAY','blown'); renderCPUGame();
    setTimeout(()=>{ cpuState.result=null; renderCPUGame(); checkCPUWin(); if(cpuState.turn==='p2') scheduleCPUTurn(); },2000); return;
  }
  if(card.face==='2'){
    cpuState.playPile=newPile; cpuState.topCard=card; cpuState.p2Hand=newHand;
    cpuState.lastPlayedBy='p2'; cpuState.lastPlayedDesc=cardDesc;
    cpuState.result='CPU played a 2 — goes again!'; cpuState.turn='p2';
    renderCPUGame(); setTimeout(()=>{ cpuState.result=null; renderCPUGame(); checkCPUWin(); if(cpuState.turn==='p2') scheduleCPUTurn(); },1500); return;
  }
  const fc={}; newPile.forEach(c=>{fc[c.face]=(fc[c.face]||0)+1;});
  if(fc[card.face]>=4){
    const nb=[...blown,...newPile]; cpuState.playPile=[]; cpuState.topCard=null; cpuState.blownPile=nb; cpuState.blownTop=card;
    cpuState.p2Hand=newHand; cpuState.lastPlayedBy='p2'; cpuState.lastPlayedDesc='4x '+card.face;
    cpuState.result='Four '+card.face+'s! BLOWN AWAY!'; cpuState.turn='p2';
    showBigFlash('BLOWN AWAY','blown'); renderCPUGame();
    setTimeout(()=>{ cpuState.result=null; renderCPUGame(); checkCPUWin(); if(cpuState.turn==='p2') scheduleCPUTurn(); },2000); return;
  }
  cpuState.playPile=newPile; cpuState.topCard=card; cpuState.p2Hand=newHand;
  cpuState.lastPlayedBy='p2'; cpuState.lastPlayedDesc=cardDesc;
  cpuState.result='CPU played '+cardDesc+'. You must match or beat it.';
  cpuState.turn='p1';
  renderCPUGame(); setTimeout(()=>{ cpuState.result=null; renderCPUGame(); checkCPUWin(); },1800);
}

function cpuChooseCard(hand,topCard,s){
  const sorted=[...hand].sort((a,b)=>cardRank(a)-cardRank(b));
  const topRank=topCard?cardRank(topCard):-999;
  const pile=s.playPile||[];
  const fc={}; pile.forEach(c=>{fc[c.face]=(fc[c.face]||0)+1;}); hand.forEach(c=>{fc[c.face]=(fc[c.face]||0)+1;});
  const qf=Object.keys(fc).find(f=>fc[f]>=4&&hand.some(c=>c.face===f));
  if(qf){ const qc=hand.find(c=>c.face===qf); if(qc&&(cardRank(qc)>=topRank||!topCard)) return qc; }
  const nonThrees=sorted.filter(c=>c.face!=='3'&&c.face!=='10');
  if(pile.length>=8){ const ten=hand.find(c=>c.face==='10'); if(ten) return ten; }
  if(topCard){
    const beaters=nonThrees.filter(c=>c.face!=='2'&&cardRank(c)>topRank);
    if(beaters.length>0) return Math.random()<0.6?beaters[0]:beaters[Math.min(1,beaters.length-1)];
    const matchers=nonThrees.filter(c=>cardRank(c)===topRank);
    if(matchers.length>0) return matchers[0];
    const two=hand.find(c=>c.face==='2'); if(two) return two;
    const three=hand.find(c=>c.face==='3'); if(three) return three;
    return null;
  }
  const mids=nonThrees.filter(c=>c.face!=='2');
  if(mids.length>0) return mids[Math.min(Math.floor(mids.length*0.3),mids.length-1)];
  return sorted[0];
}

function checkCPUWin(){
  const s=cpuState; if(!s||s.gameOver) return;
  const p1t=(s.p1Hand||[]).length+(s.p1Chosen||[]).length+(s.p1Blind||[]).length;
  const p2t=(s.p2Hand||[]).length+(s.p2Chosen||[]).length+(s.p2Blind||[]).length;
  if(p1t===0){cpuState.gameOver=true;cpuState.winner='p1';renderCPUGame();}
  else if(p2t===0){cpuState.gameOver=true;cpuState.winner='p2';renderCPUGame();}
}

// Override pile/deck taps for CPU mode
// PvP onPileTap
function onPileTapPvP(){
  if(!gameState||gameState.gameOver) return;
  // Always read fresh state from Firebase for pile actions
  roomRef.once('value', snap=>{
    const s=snap.val(); if(!s||s.gameOver) return;
    const myH=myRole==='p1'?'p1':'p2';
    const oppH=myRole==='p1'?'p2':'p1';
    const isMyTurnNow = s.turn ? s.turn===myH : true; // only default to my turn if turn never been set
    if(!isMyTurnNow){
      // Instant replay exception: selected card matches the rank we just
      // played, and the opponent hasn't played their response yet.
      const selCard = selectedIdxs.length>0 ? localHand[selectedIdxs[0]] : null;
      const canInstantReplay = !!(selCard && s.topCard && selCard.face===s.topCard.face && !s[oppH+'Played']);
      if(!canInstantReplay){ setStatus('Not your turn.'); return; }
    }
    if(selectedIdxs.length>0){
      resolving=false; // clear any stale resolving
      playSelected();
      return;
    }
    if(!s.topCard){
      setStatus('Select a card to start the pile.');
      return;
    }
    const myHandNow=s[myH+'Hand']||[];
    const myChosenNow=s[myH+'Chosen']||[];
    const myBlindNow=s[myH+'Blind']||[];
    if(myHandNow.length===0){
      if(myChosenNow.length>0) setStatus('Tap your Chosen deck to pick it up.');
      else if(myBlindNow.length>0) setStatus('Tap your Blind deck to draw a card.');
      return;
    }
    resolving=false;
    if(!canBeat(myHandNow,s.topCard)){
      pickupPile(s); // pass fresh state directly — no second Firebase read
    } else {
      setStatus('Select a card first.');
    }
  });
}

// PvP quitGame
function quitGamePvP(){
  if(!confirm('Quit the game? Your opponent will be notified.')) return;
  const myN=myRole==='p1'?(gameState&&gameState.p1?gameState.p1.name:'P1'):(gameState&&gameState.p2?gameState.p2.name:'P2');
  if(roomRef) roomRef.update({gameOver:true, quitter:myN, result:myN+' has left the game.'});
  setTimeout(()=>location.reload(), 500);
}

const _origOnPileTap=onPileTapPvP;
function onPileTap(){
  if(!cpuMode){_origOnPileTap();return;}
  const s=cpuState; if(!s||s.gameOver) return;
  if(selectedIdxs.length>0){cpuPlaySelected();return;}
  if(s.turn!=='p1') return; // nothing selected and not my turn — nothing to do
  if(!s.topCard){
    setStatus('Select a card from your hand first, then tap here.');
    return;
  }
  const myHandNow=s.p1Hand||[];
  if(myHandNow.length===0) return;
  if(!canBeat(myHandNow,s.topCard)) cpuPickupPile(); else setStatus('Select a card first.');
}

function cpuPlaySelected(){
  if(selectedIdxs.length===0) return;
  const s=cpuState;
  if(!s) return;
  const isMyTurnNow = s.turn==='p1';
  if(!isMyTurnNow){
    // Instant replay exception — mirrors onPileTapPvP: allowed only if the
    // selected card exactly matches the current top card AND CPU hasn't
    // committed its response yet.
    const selCard = localHand[selectedIdxs[0]];
    const canInstantReplay = !!(selCard && s.topCard && selCard.face===s.topCard.face && !s.p2Played);
    if(!canInstantReplay){
      selectedIdxs=[];
      const pb=document.getElementById('play-btn'); if(pb) pb.disabled=true;
      setStatus('Not your turn.');
      renderCPUGame();
      return;
    }
  }
  const cards=selectedIdxs.map(i=>localHand[i]);
  const card=cards[0];
  if(s.topCard&&card.face!=='2'&&card.face!=='10'&&card.face!=='3'){
    if(cardRank(card)<cardRank(s.topCard)){setStatus('That card does not match or beat the '+s.topCard.face+'.');return;}
  }
  const newHand=localHand.filter((_,i)=>!selectedIdxs.includes(i));
  const pile=[...(s.playPile||[])], newPile=[...pile,...cards];
  const cardDesc=cards.length>1?cards.length+'x '+card.face:card.face+sym(card.suit);
  selectedIdxs=[]; document.getElementById('play-btn').disabled=true;
  const wo=document.getElementById('waiting-overlay'); if(wo) wo.classList.add('show');
  const blown=[...(s.blownPile||[])];

  if(card.face==='10'){
    const nb=[...blown,...newPile]; cpuState.playPile=[]; cpuState.topCard=null; cpuState.blownPile=nb; cpuState.blownTop=card;
    cpuState.p1Hand=newHand; cpuState.lastPlayedBy='p1'; cpuState.lastPlayedDesc=cardDesc;
    cpuState.result='You played a 10 — BLOWN AWAY! Go again!'; cpuState.turn='p1';
    showBigFlash('BLOWN AWAY','blown'); renderCPUGame();
    setTimeout(()=>{cpuState.result=null;renderCPUGame();checkCPUWin();},2000); return;
  }
  if(card.face==='2'){
    cpuState.playPile=newPile; cpuState.topCard=card; cpuState.p1Hand=newHand;
    cpuState.lastPlayedBy='p1'; cpuState.lastPlayedDesc=cardDesc;
    cpuState.result='You played a 2 — go again!'; cpuState.turn='p1';
    renderCPUGame(); setTimeout(()=>{cpuState.result=null;renderCPUGame();checkCPUWin();},1500); return;
  }
  const fc={}; newPile.forEach(c=>{fc[c.face]=(fc[c.face]||0)+1;});
  if(fc[card.face]>=4){
    const nb=[...blown,...newPile]; cpuState.playPile=[]; cpuState.topCard=null; cpuState.blownPile=nb; cpuState.blownTop=card;
    cpuState.p1Hand=newHand; cpuState.lastPlayedBy='p1'; cpuState.lastPlayedDesc='4x '+card.face;
    cpuState.result='Four '+card.face+'s! BLOWN AWAY! Go again!'; cpuState.turn='p1';
    showBigFlash('BLOWN AWAY','blown'); renderCPUGame();
    setTimeout(()=>{cpuState.result=null;renderCPUGame();checkCPUWin();},2000); return;
  }
  cpuState.playPile=newPile; cpuState.topCard=card; cpuState.p1Hand=newHand;
  cpuState.lastPlayedBy='p1'; cpuState.lastPlayedDesc=cardDesc;
  cpuState.result='You played '+cardDesc+'. CPU must match or beat it.';
  cpuState.turn='p2'; cpuState.p2Played=false; renderCPUGame();
  setTimeout(()=>{cpuState.result=null;renderCPUGame();checkCPUWin();scheduleCPUTurn();},1500);
}

function cpuPickupPile(){
  const s=cpuState; const pile=s.playPile||[];
  cpuState.p1Hand=[...(s.p1Hand||[]),...pile];
  cpuState.playPile=[]; cpuState.topCard=null; cpuState.turn='p2'; cpuState.p2Played=false;
  cpuState.result='You pick up the pile ('+pile.length+' cards)!';
  showBigFlash('PICK IT UP','pickup');
  if(pile.length>0) throwCards(pile.slice(-3));
  renderCPUGame(); setTimeout(()=>{cpuState.result=null;renderCPUGame();scheduleCPUTurn();},2000);
}

// PvP onDeckTap
function onDeckTapPvP(){
  if(!gameState) return;
  const myH=myRole==='p1'?'p1':'p2';
  roomRef.once('value', snap=>{
    const s=snap.val(); if(!s) return;
    const myHandNow=s[myH+'Hand']||[];
    const deck=[...(s.deck||[])];
    if(deck.length===0){ setStatus('Pot is empty.'); return; }
    if(myHandNow.length>=3){ setStatus('You already have 3+ cards.'); return; }
    const drawn=deck.pop();
    const newHand=[...myHandNow, drawn];
    const update={deck:deck};
    update[myH+'Hand']=newHand;
    roomRef.update(update);
  });
}

// PvP onChosenTap
function onChosenTapPvP(){
  if(!gameState) return;
  const myH=myRole==='p1'?'p1':'p2';
  roomRef.once('value', snap=>{
    const s=snap.val(); if(!s) return;
    const myHand=s[myH+'Hand']||[];
    const myChosen=s[myH+'Chosen']||[];
    const potEmpty=(s.deck||[]).length===0;
    if(!potEmpty){ setStatus('Pot still has cards — draw from there first.'); return; }
    if(myChosen.length===0){ setStatus('Chosen deck is empty.'); return; }
    if(myHand.length>0){ setStatus('Play your hand cards first.'); return; }
    const update={};
    update[myH+'Hand']=myChosen;
    update[myH+'Chosen']=[];
    roomRef.update(update);
    setStatus('Chosen cards picked up!');
  });
}

// PvP onBlindTap
function onBlindTapPvP(){
  if(!gameState) return;
  const myH=myRole==='p1'?'p1':'p2';
  // Read fresh from Firebase to avoid stale state
  roomRef.once('value', snap=>{
    const s=snap.val(); if(!s) return;
    const myHand=s[myH+'Hand']||[];
    const myChosen=s[myH+'Chosen']||[];
    const myBlind=[...(s[myH+'Blind']||[])];
    if(myBlind.length===0){ setStatus('Blind deck is empty.'); return; }
    if(myHand.length>0){ setStatus('Play your hand cards first.'); return; }
    if(myChosen.length>0){ setStatus('Pick up your chosen deck first.'); return; }
    const isMyTurnNow = s.turn ? s.turn===myH : true;
    if(!isMyTurnNow){ setStatus('Not your turn.'); return; }
    const ri=Math.floor(Math.random()*myBlind.length);
    const drawn=myBlind.splice(ri,1)[0];
    const update={};
    update[myH+'Hand']=[drawn];
    update[myH+'Blind']=myBlind;
    // Don't set turn here - resolveRound manages turn
    roomRef.update(update);
    setStatus('You drew a blind card!');
  });
}

const _origOnDeckTap=onDeckTapPvP;
function onDeckTap(){
  if(!cpuMode){_origOnDeckTap();return;}
  const s=cpuState; if(!s) return;
  const myHandNow=s.p1Hand||[], deck=[...(s.deck||[])];
  if(deck.length===0){setStatus('Pot is empty.');return;}
  if(myHandNow.length>=3){setStatus('You have 3+ cards already.');return;}
  myHandNow.push(deck.pop()); cpuState.p1Hand=myHandNow; cpuState.deck=deck; renderCPUGame();
}

const _origOnChosenTap=onChosenTapPvP;
function onChosenTap(){
  if(!cpuMode){_origOnChosenTap();return;}
  const s=cpuState;
  const myHand=s.p1Hand||[], myChosen=s.p1Chosen||[], potEmpty=(s.deck||[]).length===0;
  if(!potEmpty){setStatus('Pot still has cards — draw from there first.');return;}
  if(myChosen.length===0){setStatus('Chosen deck is empty.');return;}
  if(myHand.length>0){setStatus('Play your hand cards first.');return;}
  cpuState.p1Hand=myChosen; cpuState.p1Chosen=[]; renderCPUGame();
}

const _origOnBlindTap=onBlindTapPvP;
function onBlindTap(){
  if(!cpuMode){_origOnBlindTap();return;}
  const s=cpuState;
  const myHand=s.p1Hand||[], myChosen=s.p1Chosen||[], myBlind=[...(s.p1Blind||[])];
  if(myBlind.length===0){setStatus('Blind deck is empty.');return;}
  if(myHand.length>0){setStatus('Play your hand cards first.');return;}
  if(myChosen.length>0){setStatus('Pick up your chosen deck first.');return;}
  const ri=Math.floor(Math.random()*myBlind.length);
  const drawn=myBlind.splice(ri,1)[0];
  cpuState.p1Hand=[drawn]; cpuState.p1Blind=myBlind; renderCPUGame();
}

// PvP confirmChosen
function confirmChosenPvP(){
  if(setupSelectedIdxs.length!==3) return;
  const chosen=setupSelectedIdxs.map(i=>setupHand[i]);
  const remaining=setupHand.filter((_,i)=>!setupSelectedIdxs.includes(i));
  document.getElementById('confirm-chosen').disabled=true;
  document.getElementById('setup-status').textContent='Waiting on opponent...';

  const myChosen    = myRole==='p1'?'p1Chosen':'p2Chosen';
  const myReady     = myRole==='p1'?'p1Ready':'p2Ready';
  const myRemaining = myRole==='p1'?'p1Remaining':'p2Remaining';

  const update={};
  update[myChosen]=chosen;
  update[myRemaining]=remaining;
  update[myReady]=true;

  roomRef.update(update).then(()=>{
    if(myRole==='p1'){
      let attempts=0;
      const poll=setInterval(()=>{
        attempts++;
        roomRef.once('value',snap=>{
          const s=snap.val();
          if(!s) return;
          if(s.p1Ready && s.p2Ready){
            clearInterval(poll);
            finalizeHands();
          } else if(attempts>120){
            clearInterval(poll);
            finalizeHands();
          }
        });
      },500);
    }
  });
}

// Override confirmChosen for CPU mode
const _origConfirmChosen=confirmChosenPvP;
function confirmChosen(){
  if(!cpuMode){_origConfirmChosen();return;}
  if(setupSelectedIdxs.length!==3) return;
  const chosen=setupSelectedIdxs.map(i=>setupHand[i]);
  const remaining=setupHand.filter((_,i)=>!setupSelectedIdxs.includes(i));
  cpuState.p1Chosen=chosen; cpuState.p1Hand=remaining;
  cpuState.status='playing';
  cpuState.turn=Math.random()<0.5?'p1':'p2';
  cpuState.coinToss=cpuState.turn;
  document.getElementById('setup').style.display='none';
  document.getElementById('game').style.display='block';
  showCoinToss(cpuState);
  setTimeout(()=>{ renderCPUGame(); if(cpuState.turn==='p2') scheduleCPUTurn(); },3000);
}

function restartGameCPU(){
  document.getElementById('winner-overlay').classList.remove('show');
  stopWinnerVideo();
  cpuMode=false; cpuState=null;
  if(cpuThinkTimeout) clearTimeout(cpuThinkTimeout);
  startCPUGame();
}

// ============================================================
// WINNER VIDEO — per-avatar "grabbing the cash" clip, falls back to
// a plain dark overlay (no video) for avatars that don't have one yet.
// ============================================================
const WINNER_VIDEO_AVATARS = ['wooch','phantom','hustler','bartender','femme-fatale','highroller','biker','punk']; // add keys here as more clips get made
const WINNER_VIDEO_MOBILE_AVATARS = ['phantom']; // avatars that also have a dedicated -mobile.mp4 clip

function avatarKeyFromFile(avatarFile){
  // 'avatar-wooch.png' -> 'wooch'
  if(!avatarFile || typeof avatarFile!=='string') return null;
  return avatarFile.replace(/^avatar-/,'').replace(/\.png$/,'');
}

function setWinnerVideo(avatarFile){
  const video=document.getElementById('winner-video');
  if(!video) return;
  const key=avatarKeyFromFile(avatarFile);
  if(key && WINNER_VIDEO_AVATARS.includes(key)){
    const useMobile = window.innerWidth <= 700 && WINNER_VIDEO_MOBILE_AVATARS.includes(key);
    video.src = useMobile ? './winner-'+key+'-mobile.mp4' : './winner-'+key+'.mp4';
    video.style.display='block';
    video.currentTime=0;
    video.play().catch(()=>{});
  } else {
    video.pause();
    video.removeAttribute('src');
    video.style.display='none';
  }
}

function stopWinnerVideo(){
  const video=document.getElementById('winner-video');
  if(!video) return;
  video.pause();
  video.style.display='none';
}

function launchConfetti(){
  const canvas=document.getElementById('confetti-canvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  canvas.width=window.innerWidth;
  canvas.height=window.innerHeight;
  canvas.style.display='block';

  const colors=['#ffe600','#00cfff','#ff2d78','#3a6aaa','#ffffff'];
  const particles=[];
  for(let i=0;i<140;i++){
    particles.push({
      x: Math.random()*canvas.width,
      y: -20 - Math.random()*canvas.height*0.5,
      w: 6+Math.random()*6,
      h: 8+Math.random()*10,
      color: colors[Math.floor(Math.random()*colors.length)],
      vx: -2+Math.random()*4,
      vy: 2+Math.random()*3,
      rot: Math.random()*360,
      vr: -8+Math.random()*16
    });
  }

  const duration=2600;
  const start=performance.now();

  function frame(now){
    const elapsed=now-start;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr;
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(p.rot*Math.PI/180);
      ctx.fillStyle=p.color;
      ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
      ctx.restore();
    });
    if(elapsed<duration){
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      canvas.style.display='none';
    }
  }
  requestAnimationFrame(frame);
}

// Override showWinner for CPU mode
function showWinner(s){
  if(cpuMode){
    document.getElementById('winner-overlay').classList.add('show');
    let iWonCPU;
    if(s.winner==='p1'||((s.p1Hand||[]).length+(s.p1Chosen||[]).length+(s.p1Blind||[]).length)===0){
      document.getElementById('winner-title').textContent='You win!';
      document.getElementById('winner-sub').textContent='You beat the CPU! CPU picks up the deck.';
      launchConfetti();
      iWonCPU=true;
    } else {
      document.getElementById('winner-title').textContent='CPU wins.';
      document.getElementById('winner-sub').textContent='The CPU beat you. Better luck next time.';
      iWonCPU=false;
    }
    setWinnerVideo(iWonCPU ? (s.p1&&s.p1.avatar) : (s.p2&&s.p2.avatar));
    if(typeof recordGameResult==='function') recordGameResult(iWonCPU);
    return;
  }
  // PvP winner
  document.getElementById('winner-overlay').classList.add('show');
  const p1n=s.p1?s.p1.name:'P1', p2n=s.p2?s.p2.name:'P2';
  let iWon=false;
  if(s.quitter){
    document.getElementById('winner-title').textContent='⚡ '+s.quitter+' left!';
    document.getElementById('winner-sub').textContent=s.quitter+' quit the game.';
    iWon=s.quitter!==(myRole==='p1'?p1n:p2n);
    // Quit games are abandoned, not a fair W/L — don't record stats.
    const winnerRole=s.quitter===p1n?'p2':'p1';
    setWinnerVideo(s[winnerRole]&&s[winnerRole].avatar);
  } else {
    const w=s.winner||(totalCards(s,'p1')===0?'p1':'p2');
    if(w==='p1'){
      document.getElementById('winner-title').textContent='⚡ '+p1n+' wins!';
      document.getElementById('winner-sub').textContent=p1n+' ran out of cards first!';
      iWon=myRole==='p1';
    } else {
      document.getElementById('winner-title').textContent='⚡ '+p2n+' wins!';
      document.getElementById('winner-sub').textContent=p2n+' ran out of cards first!';
      iWon=myRole==='p2';
    }
    setWinnerVideo(s[w]&&s[w].avatar);
    if(typeof recordGameResult==='function') recordGameResult(iWon);
  }
  if(iWon) launchConfetti();
}

// Override quitGame for CPU mode
const _origQuit=quitGamePvP;
function quitGame(){
  if(cpuMode){
    if(!confirm('Quit the game?')) return;
    cpuMode=false; cpuState=null;
    if(cpuThinkTimeout) clearTimeout(cpuThinkTimeout);
    document.getElementById('game').style.display='none';
    document.getElementById('setup').style.display='none';
    const cb=document.getElementById('cpu-badge'); if(cb) cb.style.display='none';
    
    document.getElementById('quit-btn-wrap').style.display='none';
    document.getElementById('lobby').style.display='block';
    document.getElementById('lobby-screen-1').style.display='none';
    document.getElementById('lobby-screen-2').style.display='block';
    return;
  }
  _origQuit();
}


// Load tutorial preference
tutorialOn=localStorage.getItem('3fs-tutorial')==='1';
document.addEventListener('DOMContentLoaded',()=>{
  ['tut-toggle-rules','tut-toggle-game','tut-toggle-lobby'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.checked=tutorialOn;
  });
});

// ============================================================
// DEBUG: ?debugWin=wooch — jump straight to the win screen/video for
// that avatar, skipping all game logic. Bookmark the URL and refresh
// anytime to re-test a specific winner clip.
// ============================================================
function debugShowWinner(avatarKey){
  document.getElementById('lobby').style.display='none';
  document.getElementById('setup').style.display='none';
  document.getElementById('game').style.display='block';
  document.getElementById('winner-overlay').classList.add('show');
  const displayName=AVATAR_NAMES['avatar-'+avatarKey+'.png']||avatarKey;
  document.getElementById('winner-title').textContent='⚡ '+displayName+' wins!';
  document.getElementById('winner-sub').textContent='[DEBUG] ?debugWin='+avatarKey;
  setWinnerVideo('avatar-'+avatarKey+'.png');
  launchConfetti();
}
(function(){
  const debugWin=new URLSearchParams(location.search).get('debugWin');
  if(!debugWin) return;
  // Skip the intro splash entirely — it sits above everything (z-index 5000)
  // and would otherwise hide the debug win screen behind it until tapped through.
  const killIntro=()=>{ const el=document.getElementById('intro-overlay'); if(el) el.remove(); };
  document.addEventListener('DOMContentLoaded',()=>{
    killIntro();
    setTimeout(()=>debugShowWinner(debugWin), 200);
  });
})();



function showInstallGuide(){
  const el = document.getElementById('install-overlay');
  if(el) el.style.display='flex';
}

// ============================================================
// INTRO ANIMATION — tap to begin (unmutes + plays), tap to skip anytime
// ============================================================
function initIntro(){
  const overlay = document.getElementById('intro-overlay');
  const video = document.getElementById('intro-video');
  const beginBtn = document.getElementById('intro-begin-btn');
  if(!overlay || !video || !beginBtn) return;

  // Portrait intro for narrow/mobile screens, landscape (HTML default) for
  // everything else — same 700px breakpoint used for .table-area.
  if (window.innerWidth <= 700) {
    video.src = './intro-vid-mobile.mp4';
  }

  video.muted = true; // muted until the user taps begin — required for autoplay/preload on most mobile browsers

  function ready(){
    beginBtn.disabled = false;
    beginBtn.textContent = 'TAP TO BEGIN';
  }
  video.addEventListener('canplaythrough', ready, {once:true});
  // Fallback in case the clip is missing, slow to load, or the browser never
  // fires canplaythrough — don't let a broken video trap the player here.
  setTimeout(ready, 4000);

  video.addEventListener('ended', hideIntro);
  video.addEventListener('error', hideIntro);
}

function startIntro(){
  const video = document.getElementById('intro-video');
  const beginBtn = document.getElementById('intro-begin-btn');
  const skipBtn = document.getElementById('intro-skip-btn');
  if(!video){ hideIntro(); return; }
  video.muted = false;
  const playPromise = video.play();
  if(playPromise && playPromise.catch) playPromise.catch(()=> hideIntro());
  if(beginBtn) beginBtn.style.display = 'none';
  if(skipBtn) skipBtn.style.display = 'block';
}

function skipIntro(){
  const video = document.getElementById('intro-video');
  if(video){ try{ video.pause(); }catch(e){} }
  hideIntro();
}

function hideIntro(){
  const overlay = document.getElementById('intro-overlay');
  if(overlay) overlay.remove();
  initAvatarPicker();
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initIntro);
} else {
  initIntro();
}
