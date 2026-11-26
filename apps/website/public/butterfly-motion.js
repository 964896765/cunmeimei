(() => {
  const art = document.querySelector('.hero-art');
  const hero = art.closest('.hero');
  const scene = art.querySelector('.butterfly-scene');
  const butterfly = scene.querySelector('.butterfly-flight');
  const reflection = scene.querySelector('.butterfly-reflection');
  const canvas = art.querySelector('.butterfly-trail');
  const context = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 11200;
  const departure = .30;
  const gone = .49;
  const arrival = .58;
  const landing = .86;
  const colors = ['#feefff', '#e6bcff', '#caa3ff', '#aea0ff', '#f2caff'];
  const clamp = value => Math.min(1, Math.max(0, value));
  const smooth = value => clamp(value) ** 2 * (3 - 2 * clamp(value));
  const motes = Array.from({ length: 176 }, () => ({
    drift: Math.random() * 2 - 1,
    ageOffset: Math.random(),
    size: .52 + Math.random() ** 2.8 * 2.6,
    shimmer: Math.random() * Math.PI * 2
  }));
  let animation;
  let frame = 0;
  let visible = true;
  let geometry;

  function curve(points, t) {
    const [a, b, c, d] = points;
    const u = 1 - t;
    const position = axis => u ** 3 * a[axis] + 3 * u * u * t * b[axis]
      + 3 * u * t * t * c[axis] + t ** 3 * d[axis];
    const tangent = axis => u * u * (b[axis] - a[axis])
      + 2 * u * t * (c[axis] - b[axis]) + t * t * (d[axis] - c[axis]);
    // The butterfly artwork faces up, so its rotation follows the tangent from that axis.
    return { x: position(0), y: position(1), angle: Math.atan2(tangent(0), -tangent(1)) };
  }

  function pose(phase) {
    const { x, y, width, height, outbound, inbound } = geometry;
    if (phase < departure) {
      const hover = Math.sin(phase / departure * Math.PI);
      return { x: x + width * .005 * hover, y: y - height * .018 * hover, angle: hover * .045, scale: 1, opacity: 1 };
    }
    if (phase < gone) {
      const progress = ((phase - departure) / (gone - departure)) ** 1.45;
      const position = curve(outbound, progress);
      // Bank toward takeoff while still close to the resting position.
      position.angle *= smooth(progress / .10);
      return { ...position, scale: 1 - .78 * progress, opacity: 1 - smooth((progress - .73) / .27), flying: true };
    }
    if (phase < arrival) return { x: width * 1.14, y: 0, angle: 0, scale: .22, opacity: 0 };
    if (phase < landing) {
      const progress = 1 - (1 - (phase - arrival) / (landing - arrival)) ** 1.65;
      return {
        ...curve(inbound, progress),
        scale: .22 + .78 * smooth(progress),
        opacity: smooth(progress / .19),
        flying: true
      };
    }
    const angle = curve(inbound, 1).angle * (1 - smooth((phase - landing) / .085));
    return { x, y, angle, scale: 1, opacity: 1 };
  }

  function drawTrail(time, phase) {
    if (!context) return;
    const { width, height, wingHeight } = geometry;
    context.clearRect(0, 0, width, height);
    if (phase < departure || phase >= landing + .082) return;
    const count = width < 656 ? 108 : motes.length;
    for (let index = 0; index < count; index++) {
      const mote = motes[index];
      const age = (index + mote.ageOffset) / count;
      const sample = pose(phase - age * .082);
      if (!sample.flying || sample.opacity < .03) continue;
      const distance = wingHeight * sample.scale * (.28 + age * .16);
      const spread = mote.drift * wingHeight * sample.scale * (.029 + age * .17);
      const x = sample.x - Math.sin(sample.angle) * distance + Math.cos(sample.angle) * spread;
      const y = sample.y + Math.cos(sample.angle) * distance + Math.sin(sample.angle) * spread;
      const size = mote.size * (.62 + .38 * sample.scale);
      const alpha = sample.opacity * (1 - age) ** 1.12 * (.79 + .21 * Math.sin(time / 120 + mote.shimmer));
      context.fillStyle = colors[index % colors.length];
      context.globalAlpha = alpha;
      context.beginPath();
      if (index % 9 === 0) {
        context.moveTo(x, y - size * 2.25);
        context.lineTo(x + size, y);
        context.lineTo(x, y + size * 1.85);
        context.lineTo(x - size, y);
        context.closePath();
      } else {
        context.arc(x, y, size, 0, Math.PI * 2);
      }
      context.fill();
      if (size > 1.45) {
        context.globalAlpha = alpha * .17;
        context.beginPath();
        context.arc(x, y, size * 3.3, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalAlpha = 1;
  }

  function paint() {
    const time = animation.currentTime ?? 0;
    const phase = (time % duration) / duration;
    butterfly.classList.toggle('is-flying', (phase >= departure && phase < gone) || (phase >= arrival && phase < landing));
    reflection.style.opacity = .2 * Math.max(1 - smooth((phase - .26) / .11), smooth((phase - .88) / .1));
    drawTrail(time, phase);
  }

  function tick() {
    paint();
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    if (!animation) return;
    const running = !reduced.matches && visible && !document.hidden && !hero.classList.contains('is-paused');
    if (running && !frame) {
      animation.play();
      frame = requestAnimationFrame(tick);
    } else if (!running) {
      animation.pause();
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function layout() {
    if (reduced.matches) {
      animation?.cancel();
      animation = undefined;
      cancelAnimationFrame(frame);
      frame = 0;
      reflection.style.removeProperty('opacity');
      butterfly.classList.remove('is-flying');
      return;
    }
    const bounds = art.getBoundingClientRect();
    const rest = scene.getBoundingClientRect();
    const { width, height } = bounds;
    if (!width || !height) return;
    const x = rest.left - bounds.left + rest.width * .5;
    const y = rest.top - bounds.top + rest.height * .56;
    const right = width - x;
    geometry = {
      width, height, x, y, wingHeight: rest.height,
      outbound: [[x, y], [x + right * .32, y - height * .34], [x + right * .78, y - height * .32], [width * 1.14, y - height * .64]],
      inbound: [[-width * .12, height * .27], [width * .17, height * .10], [x - width * .16, y - height * .26], [x, y]]
    };
    if (context) {
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    }
    const time = animation?.currentTime ?? 0;
    animation?.cancel();
    cancelAnimationFrame(frame);
    frame = 0;
    const keyframes = Array.from({ length: 201 }, (_, index) => {
      const offset = index / 200;
      const { x: left, y: top, angle, scale, opacity } = pose(offset);
      return { offset, transform: `translate(${left - x}px, ${top - y}px) rotate(${angle}rad) scale(${scale})`, opacity };
    });
    animation = butterfly.animate(keyframes, { duration, iterations: Infinity });
    animation.currentTime = time;
    paint();
    sync();
  }

  hero.querySelector('.motion-toggle').addEventListener('click', sync);
  reduced.addEventListener('change', layout);
  document.addEventListener('visibilitychange', sync);
  new ResizeObserver(layout).observe(art);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(art);
  layout();
})();
