/*
 * Animation du portail — Le Quizz du BAC
 * Version améliorée : désintégration du personnage en fragments/poussières.
 * Usage : await playBacPortalAnimation('#bacPortalScene');
 */
(function () {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function ensureSparks(scene) {
    const holder = scene.querySelector('.bac-sparks');
    if (!holder || holder.children.length) return;
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('i');
      s.className = 'bac-spark';
      const angle = (360 / 26) * i + (Math.random() * 10 - 5);
      const radius = 28 + Math.random() * 34;
      s.dataset.angle = angle;
      s.dataset.radius = radius;
      holder.appendChild(s);
    }
  }

  function clearFragments(scene) {
    const holder = scene.querySelector('.bac-fragments');
    if (holder) holder.innerHTML = '';
  }

  function resetScene(scene) {
    const portal = scene.querySelector('.bac-portal');
    const world = scene.querySelector('.bac-world-window');
    const core = scene.querySelector('.bac-portal-core');
    const ring = scene.querySelector('.bac-vortex-ring');
    const character = scene.querySelector('.bac-character');
    const light = scene.querySelector('.bac-magic-light');
    const flash = scene.querySelector('.bac-flash');
    const dust = scene.querySelector('.bac-dust');
    const sparks = scene.querySelectorAll('.bac-spark');

    [portal, world, core, ring, character, light, flash, dust, ...sparks].forEach(el => {
      if (!el) return;
      el.getAnimations().forEach(a => a.cancel());
    });

    const frags = scene.querySelectorAll('.bac-frag');
    frags.forEach(el => el.getAnimations().forEach(a => a.cancel()));
    clearFragments(scene);

    if (portal) {
      portal.style.opacity = '0';
      portal.style.transform = 'translate(-50%, -50%) scale(.01)';
    }
    if (world) {
      world.style.opacity = '0';
      world.style.transform = 'translate(-50%, -50%) scale(.92)';
    }
    if (core) {
      core.style.opacity = '0';
      core.style.transform = 'translate(-50%, -50%) scale(.2)';
    }
    if (ring) ring.style.transform = 'rotate(0deg)';
    if (light) light.style.opacity = '0';
    if (flash) flash.style.opacity = '0';
    if (dust) dust.style.opacity = '0';
    if (character) {
      character.style.opacity = '1';
      character.style.transform = 'translate3d(0,0,0) rotate(0deg) scale(1)';
      character.style.filter = 'drop-shadow(0 12px 7px rgba(57,31,5,.24))';
    }
  }

  function animateSparks(scene) {
    const sparks = [...scene.querySelectorAll('.bac-spark')];
    return sparks.map((s, i) => {
      const angle = Number(s.dataset.angle || 0) * Math.PI / 180;
      const r = Number(s.dataset.radius || 45);
      const x1 = Math.cos(angle) * r;
      const y1 = Math.sin(angle) * r;
      const x2 = Math.cos(angle + 1.15) * (r * .25);
      const y2 = Math.sin(angle + 1.15) * (r * .25);
      return s.animate([
        { transform: `translate(-50%,-50%) translate(${x1}%,${y1}%) scale(.2)`, opacity: 0 },
        { opacity: .95, offset: .22 },
        { transform: `translate(-50%,-50%) translate(${x2}%,${y2}%) scale(1.5)`, opacity: .8, offset: .72 },
        { transform: 'translate(-50%,-50%) translate(0,0) scale(.1)', opacity: 0 }
      ], {
        duration: 1450 + (i % 5) * 90,
        delay: 580 + (i % 7) * 45,
        easing: 'cubic-bezier(.2,.7,.2,1)',
        fill: 'both'
      });
    });
  }

  function createCharacterFragments(scene, cols = 9, rows = 12) {
    const holder = scene.querySelector('.bac-fragments');
    const character = scene.querySelector('.bac-character');
    if (!holder || !character) return [];

    holder.innerHTML = '';

    const sceneRect = scene.getBoundingClientRect();
    const charRect = character.getBoundingClientRect();
    const left = charRect.left - sceneRect.left;
    const top = charRect.top - sceneRect.top;
    const src = character.currentSrc || character.getAttribute('src');
    const pieceW = charRect.width / cols;
    const pieceH = charRect.height / rows;

    const fragments = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const frag = document.createElement('span');
        frag.className = 'bac-frag';
        frag.style.left = `${left + col * pieceW}px`;
        frag.style.top = `${top + row * pieceH}px`;
        frag.style.width = `${pieceW + 1}px`;
        frag.style.height = `${pieceH + 1}px`;
        frag.style.opacity = '0';
        frag.style.backgroundImage = `url("${src}")`;
        frag.style.backgroundSize = `${charRect.width}px ${charRect.height}px`;
        frag.style.backgroundPosition = `-${col * pieceW}px -${row * pieceH}px`;
        holder.appendChild(frag);

        frag._x = left + col * pieceW;
        frag._y = top + row * pieceH;
        frag._w = pieceW;
        frag._h = pieceH;
        frag._col = col;
        frag._row = row;
        fragments.push(frag);
      }
    }

    return fragments;
  }

  async function disintegrateCharacter(scene, portalCenterX, portalCenterY) {
    const character = scene.querySelector('.bac-character');
    const sceneRect = scene.getBoundingClientRect();
    const portalX = portalCenterX - sceneRect.left;
    const portalY = portalCenterY - sceneRect.top;
    const fragments = createCharacterFragments(scene, 12, 16);
    if (!fragments.length) return;

    character.style.opacity = '0';

    const promises = fragments.map((frag) => {
      const fragCx = frag._x + frag._w / 2;
      const fragCy = frag._y + frag._h / 2;
      const dx = portalX - fragCx;
      const dy = portalY - fragCy;

      const swirlX = (Math.random() - .5) * 44;
      const swirlY = (Math.random() - .5) * 56;
      const driftX = (Math.random() - .5) * 30;
      const driftY = (Math.random() - .5) * 34;
      const rotA = (Math.random() - .5) * 90;
      const rotB = (Math.random() - .5) * 220;
      const colFactor = 1 - (frag._col / 8);
      const delay = 30 + (frag._row * 8) + (colFactor * 75) + Math.random() * 60;
      const duration = 720 + Math.random() * 260;

      return frag.animate([
        { transform: 'translate3d(0,0,0) scale(1) rotate(0deg)', opacity: 1, filter: 'blur(0px)' },
        { transform: `translate3d(${swirlX}px,${swirlY}px,0) scale(.94) rotate(${rotA}deg)`, opacity: 1, filter: 'blur(0px)', offset: .20 },
        { transform: `translate3d(${dx * .42 + swirlX + driftX}px,${dy * .42 + swirlY + driftY}px,0) scale(.72) rotate(${rotB}deg)`, opacity: .88, filter: 'blur(.35px)', offset: .58 },
        { transform: `translate3d(${dx * .80}px,${dy * .80}px,0) scale(.28) rotate(${rotB + 120}deg)`, opacity: .38, filter: 'blur(1.1px)', offset: .86 },
        { transform: `translate3d(${dx}px,${dy}px,0) scale(.04) rotate(${rotB + 220}deg)`, opacity: 0, filter: 'blur(2.2px)' }
      ], {
        duration,
        delay,
        easing: 'cubic-bezier(.36,.02,.68,1)',
        fill: 'forwards'
      }).finished.then(() => frag.remove());
    });

    await Promise.all(promises);
    clearFragments(scene);
  }

  async function playBacPortalAnimation(target, options = {}) {
    const scene = typeof target === 'string' ? document.querySelector(target) : target;
    if (!scene) throw new Error('Zone .bac-portal-scene introuvable');
    if (scene.dataset.animating === '1') return;
    scene.dataset.animating = '1';

    ensureSparks(scene);
    resetScene(scene);

    const portal = scene.querySelector('.bac-portal');
    const world = scene.querySelector('.bac-world-window');
    const core = scene.querySelector('.bac-portal-core');
    const ring = scene.querySelector('.bac-vortex-ring');
    const character = scene.querySelector('.bac-character');
    const light = scene.querySelector('.bac-magic-light');
    const flash = scene.querySelector('.bac-flash');
    const dust = scene.querySelector('.bac-dust');

    const portalRect = portal.getBoundingClientRect();
    const portalCenterX = portalRect.left + portalRect.width / 2;
    const portalCenterY = portalRect.top + portalRect.height / 2;

    // 0 → 0.35 s : scène normale.
    await sleep(320);

    // 0.35 → 1.2 s : naissance et ouverture du portail.
    portal.animate([
      { transform: 'translate(-50%, -50%) scale(.01)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(.16)', opacity: 1, offset: .22 },
      { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1, offset: .82 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }
    ], { duration: 900, easing: 'cubic-bezier(.16,.72,.23,1.18)', fill: 'forwards' });

    ring.animate([
      { transform: 'rotate(0deg) scale(.92)' },
      { transform: 'rotate(510deg) scale(1.03)' }
    ], { duration: 2700, easing: 'linear', fill: 'forwards' });

    core.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.15)' },
      { opacity: .95, transform: 'translate(-50%,-50%) scale(1.15)', offset: .55 },
      { opacity: .25, transform: 'translate(-50%,-50%) scale(.75)' }
    ], { duration: 850, easing: 'ease-out', fill: 'forwards' });

    light.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 650, fill: 'forwards' });
    flash.animate([{ opacity: 0 }, { opacity: .8, offset: .6 }, { opacity: .15 }], { duration: 520, fill: 'forwards' });

    world.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.65)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .7 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1.04)' }
    ], { duration: 900, delay: 260, easing: 'ease-out', fill: 'forwards' });

    animateSparks(scene);
    dust.animate([
      { opacity: 0, transform: 'translateX(0) scale(1)' },
      { opacity: .85, offset: .3 },
      { opacity: .65, transform: 'translateX(18%) scale(.85)', offset: .8 },
      { opacity: 0, transform: 'translateX(28%) scale(.5)' }
    ], { duration: 1600, delay: 520, easing: 'ease-in', fill: 'both' });

    await sleep(880);

    // 1.2 → 1.55 s : petite réaction avant désintégration.
    await character.animate([
      { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' },
      { transform: 'translate3d(2px,-1px,0) rotate(2deg) scale(1)' },
      { transform: 'translate3d(-2px,1px,0) rotate(-2deg) scale(1)' },
      { transform: 'translate3d(3px,-2px,0) rotate(2deg) scale(.995)' },
      { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' }
    ], { duration: 320, easing: 'ease-in-out', fill: 'forwards' }).finished;

    character.style.transform = 'translate3d(0,0,0) rotate(0deg) scale(1)';

    // 1.55 → 2.7 s : aspiration par petits fragments.
    world.animate([
      { transform: 'translate(-50%,-50%) scale(1.04)' },
      { transform: 'translate(-50%,-50%) scale(1.17)' }
    ], { duration: 1100, easing: 'ease-in', fill: 'forwards' });

    await disintegrateCharacter(scene, portalCenterX, portalCenterY);

    // 2.7 → 3.2 s : fermeture du portail.
    flash.animate([
      { opacity: .1 },
      { opacity: .95, offset: .28 },
      { opacity: 0 }
    ], { duration: 420, easing: 'ease-out', fill: 'forwards' });

    const close = portal.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(.58)', opacity: 1, offset: .46 },
      { transform: 'translate(-50%, -50%) scale(.03)', opacity: 0 }
    ], { duration: 560, easing: 'cubic-bezier(.55,.06,.88,.52)', fill: 'forwards' });

    light.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, fill: 'forwards' });
    world.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 430, delay: 80, fill: 'forwards' });

    await close.finished;
    await sleep(80);

    portal.style.opacity = '0';
    light.style.opacity = '0';
    flash.style.opacity = '0';
    character.style.opacity = '0';
    scene.dataset.animating = '0';

    if (typeof options.onComplete === 'function') options.onComplete();
  }

  function restoreBacPortalScene(target) {
    const scene = typeof target === 'string' ? document.querySelector(target) : target;
    if (!scene) return;
    resetScene(scene);
    scene.dataset.animating = '0';
  }

  window.playBacPortalAnimation = playBacPortalAnimation;
  window.restoreBacPortalScene = restoreBacPortalScene;
})();
