/* ============================================================
   星宸学社 STELLARSAGE · 生日祝福动画
   文件：data2/birthday.js
   依赖：data2/birthday.css
   说明：提供 window.SSBirthday 接口
   接口：
     SSBirthday.mount(container, options)  挂载一款动画
        - container: DOM 元素或选择器字符串
        - options: { index, name, date }
          index 指定款（0-6），不传则随机（隐藏款 10% 概率）
          name  成员姓名，替换 {{NAME}}
          date  日期文字，替换 {{DATE}}，不传默认今天
        - 返回 { index, id, name, el } 或 null
     SSBirthday.unmount(container)         卸载并清理
     SSBirthday.playTune()                 播放音效（祝你生日快乐最后一句）
     SSBirthday.ensureAudio()              手动激活 AudioContext
     SSBirthday.pickRandom()               返回随机一款的索引
     SSBirthday.checkBirthday(members)     检查今日生日，返回成员数组
     SSBirthday.solarToLunar(y, m, d)      公历转农历
     SSBirthday.openScreen(options)        打开生日开屏
        - options: { names: [], duration, btnDelay, onClose }
          names     姓名数组，显示为 "张三、李四"
          duration  自动关闭毫秒（默认 6000）
          btnDelay  按钮淡入延迟（默认 1500）
          onClose   关闭回调
        - 返回 { close }
     SSBirthday.FX                         效果列表（含 id / name / hidden 字段）
   ============================================================ */
(function(global){
  'use strict';

  var TAU = Math.PI * 2;
  function R(a, b){ return a + Math.random() * (b - a); }
  function RI(a, b){ return Math.floor(R(a, b + 1)); }

  function fitCanvas(cvs){
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cvs.clientWidth || 1;
    var h = cvs.clientHeight || 1;
    cvs.width = Math.max(1, Math.round(w * dpr));
    cvs.height = Math.max(1, Math.round(h * dpr));
    var ctx = cvs.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function todayStr(){
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + ' · ' + (m < 10 ? '0' + m : m) + ' · ' + (day < 10 ? '0' + day : day);
  }

  function applyData(html, data){
    data = data || {};
    var name = data.name || '你';
    var date = data.date || todayStr();
    return html
      .replace(/\{\{NAME\}\}/g, name)
      .replace(/\{\{DATE\}\}/g, date);
  }

  /* ============================================================
     音效：祝你生日快乐（最后一句） F F E C D C
     ============================================================ */
  var actx = null;
  function ensureAudio(){
    if (!actx){
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function playBirthdayTune(){
    var ctx = ensureAudio();
    if (!ctx) return;

    var notes = [
      { f: 349.23, t: 0.00, d: 0.26 },
      { f: 349.23, t: 0.30, d: 0.26 },
      { f: 329.63, t: 0.60, d: 0.52 },
      { f: 261.63, t: 1.20, d: 0.52 },
      { f: 293.66, t: 1.80, d: 0.52 },
      { f: 261.63, t: 2.40, d: 1.35 }
    ];

    var now = ctx.currentTime + 0.08;

    var master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);

    var dly = ctx.createDelay();
    dly.delayTime.value = 0.21;
    var fb = ctx.createGain();
    fb.gain.value = 0.2;
    var wet = ctx.createGain();
    wet.gain.value = 0.26;
    master.connect(dly);
    dly.connect(fb);
    fb.connect(dly);
    dly.connect(wet);
    wet.connect(ctx.destination);

    notes.forEach(function(n){
      var t0 = now + n.t;
      var dur = n.d;

      var o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = n.f;

      var o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = n.f * 2.01;

      var g1 = ctx.createGain();
      g1.gain.setValueAtTime(0.0001, t0);
      g1.gain.linearRampToValueAtTime(0.32, t0 + 0.014);
      g1.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 1.7);

      var g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.linearRampToValueAtTime(0.085, t0 + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.9);

      o1.connect(g1); g1.connect(master);
      o2.connect(g2); g2.connect(master);

      o1.start(t0); o1.stop(t0 + dur * 1.9 + 0.12);
      o2.start(t0); o2.stop(t0 + dur * 1.0 + 0.12);
    });
  }

  /* ============================================================
     农历算法（2000–2100 内嵌表）
     基准：2000-02-05 为农历 2000 年正月初一
     ============================================================ */
  var LUNAR_INFO = [
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
    0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
    0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
    0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
    0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
    0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
    0x0d520
  ];
  var LUNAR_BASE_YEAR = 2000;
  var LUNAR_BASE_UTC = Date.UTC(2000, 1, 5);

  function lLeapMonth(y){ return LUNAR_INFO[y - LUNAR_BASE_YEAR] & 0xf; }
  function lLeapDays(y){
    if (lLeapMonth(y)) return (LUNAR_INFO[y - LUNAR_BASE_YEAR] & 0x10000) ? 30 : 29;
    return 0;
  }
  function lMonthDays(y, m){
    return (LUNAR_INFO[y - LUNAR_BASE_YEAR] & (0x10000 >> m)) ? 30 : 29;
  }
  function lYearDays(y){
    var sum = 348;
    for (var i = 0x8000; i > 0x8; i >>= 1){
      sum += (LUNAR_INFO[y - LUNAR_BASE_YEAR] & i) ? 1 : 0;
    }
    return sum + lLeapDays(y);
  }

  function solarToLunar(y, m, d){
    var offset = (Date.UTC(y, m - 1, d) - LUNAR_BASE_UTC) / 86400000;
    if (offset < 0) return null;
    var i, temp = 0;
    for (i = LUNAR_BASE_YEAR; i < 2101 && offset > 0; i++){
      temp = lYearDays(i);
      offset -= temp;
    }
    if (offset < 0){ offset += temp; i--; }
    var year = i;
    var leap = lLeapMonth(year);
    var isLeap = false;
    for (i = 1; i < 13 && offset > 0; i++){
      if (leap > 0 && i === leap + 1 && !isLeap){
        --i;
        isLeap = true;
        temp = lLeapDays(year);
      } else {
        temp = lMonthDays(year, i);
      }
      if (isLeap && i === leap + 1) isLeap = false;
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && i === leap + 1){
      if (isLeap){ isLeap = false; }
      else { isLeap = true; --i; }
    }
    if (offset < 0){ offset += temp; --i; }
    return { year: year, month: i, day: offset + 1, isLeap: isLeap };
  }

  /* ============================================================
     生日检测
     ============================================================ */
  function checkBirthday(members){
    if (!members || !members.length) return [];
    var now = new Date();
    var gy = now.getFullYear(), gm = now.getMonth() + 1, gd = now.getDate();
    var lunar = solarToLunar(gy, gm, gd);
    var hits = [];

    members.forEach(function(m){
      var b = (m.birthday || '').trim();
      if (!b) return;
      var isLunar = false;
      var mm = b.match(/^\[农历\]\s*(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (mm){ isLunar = true; }
      else {
        mm = b.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      }
      if (!mm) return;
      var bm = parseInt(mm[2], 10);
      var bd = parseInt(mm[3], 10);
      if (isLunar){
        if (lunar && lunar.month === bm && lunar.day === bd) hits.push(m);
      } else {
        if (gm === bm && gd === bd) hits.push(m);
      }
    });

    return hits;
  }

  /* ============================================================
     效果定义
     ============================================================ */
  var FX = [

  /* ---------------- 01 星芒绽放 ---------------- */
  {
    id: 'starburst',
    name: '星芒绽放',
    hidden: false,
    html: [
      '<canvas class="cvs"></canvas>',
      '<div class="layer">',
        '<div class="sb-date">{{DATE}}</div>',
        '<h1 class="sb-title">生日快乐</h1>',
        '<span class="sb-line"></span>',
        '<div class="sb-name">致 · {{NAME}}</div>',
        '<div class="sb-en">HAPPY BIRTHDAY</div>',
      '</div>'
    ].join(''),
    init: function(root){
      var cvs = root.querySelector('.cvs');
      var env = fitCanvas(cvs);
      var ctx = env.ctx, w = env.w, h = env.h;

      var COLORS = { blue: '#5B9EFF', white: '#FFFFFF', gold: '#E8C87A' };
      var parts = [];
      var running = true;
      var raf = null;
      var lastT = performance.now();
      var lastBurst = 0;

      function burst(cx, cy){
        parts = [];
        var n = 140;
        for (var i = 0; i < n; i++){
          var a = TAU * i / n + R(-0.07, 0.07);
          var sp = R(1.5, 7.4);
          var pick = Math.random();
          var hue = pick < 0.6 ? 'blue' : (pick < 0.85 ? 'white' : 'gold');
          parts.push({
            x: cx, y: cy,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 0,
            max: R(62, 126),
            size: R(3, 11),
            rot: R(0, TAU),
            vr: R(-0.045, 0.045),
            hue: hue
          });
        }
      }

      function drawStar(x, y, s, rot){
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(0, 0, s, 0);
        ctx.quadraticCurveTo(0, 0, 0, s);
        ctx.quadraticCurveTo(0, 0, -s, 0);
        ctx.quadraticCurveTo(0, 0, 0, -s);
        ctx.fill();
        ctx.restore();
      }

      burst(w / 2, h / 2);
      lastBurst = performance.now();

      function loop(now){
        if (!running) return;
        var dt = Math.min((now - lastT) / 16.67, 3);
        lastT = now;

        ctx.clearRect(0, 0, w, h);

        var gl = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.55);
        gl.addColorStop(0, 'rgba(55,120,229,.22)');
        gl.addColorStop(1, 'rgba(55,120,229,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(0, 0, w, h);

        var alive = false;
        for (var i = 0; i < parts.length; i++){
          var p = parts[i];
          if (p.life > p.max) continue;
          alive = true;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.975;
          p.vy *= 0.975;
          p.vy += 0.02 * dt;
          p.rot += p.vr * dt;
          p.life += dt;

          var k = 1 - p.life / p.max;
          if (k <= 0) continue;
          ctx.globalAlpha = Math.max(0, k * k);
          ctx.fillStyle = COLORS[p.hue];
          ctx.shadowBlur = 14;
          ctx.shadowColor = COLORS[p.hue];
          drawStar(p.x, p.y, p.size * k, p.rot);
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        if (!alive && now - lastBurst > 500){
          burst(w / 2, h / 2);
          lastBurst = now;
        }

        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);

      function onResize(){
        env = fitCanvas(cvs);
        ctx = env.ctx; w = env.w; h = env.h;
        burst(w / 2, h / 2);
        lastBurst = performance.now();
      }
      window.addEventListener('resize', onResize);

      return function(){
        running = false;
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
      };
    }
  },

  /* ---------------- 02 彩带礼花 ---------------- */
  {
    id: 'confetti',
    name: '彩带礼花',
    hidden: false,
    html: [
      '<canvas class="cvs"></canvas>',
      '<div class="layer">',
        '<div class="cf-title">HAPPY<br>BIRTHDAY</div>',
        '<div class="cf-name">{{NAME}} · 生日快乐</div>',
      '</div>'
    ].join(''),
    init: function(root){
      var cvs = root.querySelector('.cvs');
      var env = fitCanvas(cvs);
      var ctx = env.ctx, w = env.w, h = env.h;

      var PALETTE = ['#3778e5', '#5B9EFF', '#8FBEFF', '#E8C87A', '#FFFFFF', '#8B5CF6', '#38BDF8'];
      var pieces = [];
      var running = true;
      var raf = null;
      var lastT = performance.now();

      function spawn(side){
        var count = 34;
        for (var i = 0; i < count; i++){
          var fromLeft = side === 'left';
          var ang = fromLeft ? R(-1.15, -0.62) : R(-2.52, -1.99);
          var sp = R(9, 20);
          pieces.push({
            x: fromLeft ? -20 : w + 20,
            y: h + 20,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            w: R(6, 13),
            h: R(9, 18),
            rot: R(0, TAU),
            vr: R(-0.22, 0.22),
            color: PALETTE[RI(0, PALETTE.length - 1)],
            life: 0,
            max: R(150, 260)
          });
        }
      }

      spawn('left');
      setTimeout(function(){ if (running) spawn('right'); }, 140);
      setTimeout(function(){ if (running) spawn('left'); }, 300);

      function loop(now){
        if (!running) return;
        var dt = Math.min((now - lastT) / 16.67, 3);
        lastT = now;

        ctx.clearRect(0, 0, w, h);

        for (var i = pieces.length - 1; i >= 0; i--){
          var p = pieces[i];
          p.vy += 0.36 * dt;
          p.vx *= 0.992;
          p.vy *= 0.992;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          p.life += dt;

          if (p.y > h + 120 || p.life > p.max){
            pieces.splice(i, 1);
            continue;
          }

          var fade = p.life > p.max - 40 ? (p.max - p.life) / 40 : 1;
          ctx.save();
          ctx.globalAlpha = Math.max(0, fade);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }

        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);

      var respawn = setInterval(function(){
        if (!running) return;
        if (pieces.length < 4){
          spawn('left');
          setTimeout(function(){ if (running) spawn('right'); }, 130);
        }
      }, 1400);

      function onResize(){
        env = fitCanvas(cvs);
        ctx = env.ctx; w = env.w; h = env.h;
      }
      window.addEventListener('resize', onResize);

      return function(){
        running = false;
        if (raf) cancelAnimationFrame(raf);
        clearInterval(respawn);
        window.removeEventListener('resize', onResize);
      };
    }
  },

  /* ---------------- 03 涟漪光晕 ---------------- */
  {
    id: 'ripple',
    name: '涟漪光晕',
    hidden: false,
    html: [
      '<div class="rp-wrap"></div>',
      '<div class="layer">',
        '<div class="rp-title">生日快乐</div>',
        '<div class="rp-sub">致 · {{NAME}}</div>',
      '</div>'
    ].join(''),
    init: function(root){
      var wrap = root.querySelector('.rp-wrap');
      var title = root.querySelector('.rp-title');

      var ringEls = [];
      for (var i = 0; i < 7; i++){
        var d = document.createElement('span');
        d.className = 'rp-ring';
        d.style.animationDelay = (i * 0.48) + 's';
        wrap.appendChild(d);
        ringEls.push(d);
      }

      var chars = title.textContent.split('');
      title.innerHTML = chars.map(function(c, i){
        return '<span style="animation-delay:' + (0.35 + i * 0.12) + 's">' + c + '</span>';
      }).join('');

      return function(){
        ringEls.forEach(function(el){ if (el.parentNode) el.parentNode.removeChild(el); });
      };
    }
  },

  /* ---------------- 04 气球升空 ---------------- */
  {
    id: 'balloon',
    name: '气球升空',
    hidden: false,
    html: [
      '<div class="bl-wrap"></div>',
      '<div class="layer">',
        '<div class="bl-title">生日快乐</div>',
        '<div class="bl-name">致 · {{NAME}}</div>',
      '</div>'
    ].join(''),
    init: function(root){
      var wrap = root.querySelector('.bl-wrap');
      var COLORS = ['#3778e5', '#5B9EFF', '#8B5CF6', '#E8C87A', '#38BDF8', '#F472B6', '#34D399', '#FB923C'];
      var nodes = [];

      for (var i = 0; i < 18; i++){
        var b = document.createElement('div');
        b.className = 'balloon';
        b.style.left = R(1, 92) + '%';
        b.style.setProperty('--s', R(0.55, 1.3).toFixed(2));
        b.style.setProperty('--bc', COLORS[i % COLORS.length]);
        b.style.animationDuration = R(11, 21).toFixed(1) + 's';
        b.style.animationDelay = (-R(0, 18)).toFixed(1) + 's';
        b.innerHTML = '<span class="bl-body"></span><span class="bl-string"></span>';
        wrap.appendChild(b);
        nodes.push(b);
      }

      return function(){
        nodes.forEach(function(n){ if (n.parentNode) n.parentNode.removeChild(n); });
        nodes = [];
      };
    }
  },

  /* ---------------- 05 霓虹打字 ---------------- */
  {
    id: 'neon',
    name: '霓虹打字',
    hidden: false,
    html: [
      '<div class="layer">',
        '<div class="ne-prefix">&gt; HAPPY_BIRTHDAY</div>',
        '<div class="ne-title"><span class="ne-text"></span><span class="ne-caret"></span></div>',
        '<div class="ne-name">// 致 · {{NAME}}</div>',
      '</div>'
    ].join(''),
    init: function(root){
      var el = root.querySelector('.ne-text');
      var nameEl = root.querySelector('.ne-name');
      var text = '生日快乐';
      var i = 0;
      var nameTimer = null;

      var typeTimer = setInterval(function(){
        i++;
        el.textContent = text.slice(0, i);
        if (i >= text.length){
          clearInterval(typeTimer);
          nameTimer = setTimeout(function(){
            if (nameEl) nameEl.classList.add('on');
          }, 380);
        }
      }, 175);

      return function(){
        clearInterval(typeTimer);
        if (nameTimer) clearTimeout(nameTimer);
      };
    }
  },

  /* ---------------- 06 星系漩涡（隐藏款） ---------------- */
  {
    id: 'galaxy',
    name: '星系漩涡',
    hidden: true,
    html: [
      '<canvas class="cvs"></canvas>',
      '<span class="gx-badge">HIDDEN</span>',
      '<div class="layer">',
        '<div class="gx-title">生日快乐</div>',
        '<div class="gx-name">{{NAME}} · STELLARSAGE</div>',
      '</div>'
    ].join(''),
    init: function(root){
      var cvs = root.querySelector('.cvs');
      var env = fitCanvas(cvs);
      var ctx = env.ctx, w = env.w, h = env.h;

      var parts = [];
      var running = true;
      var raf = null;
      var lastT = performance.now();

      function spawn(){
        parts = [];
        var n = 260;
        for (var i = 0; i < n; i++){
          var a = R(0, TAU);
          var r = R(Math.max(w, h) * 0.42, Math.max(w, h) * 0.92);
          parts.push({
            ang: a,
            rad: r,
            radSpeed: R(1.1, 2.9),
            angSpeed: R(0.006, 0.02),
            size: R(0.7, 2.6),
            life: 0,
            max: R(90, 180),
            hue: Math.random() < 0.55 ? 'blue' : (Math.random() < 0.55 ? 'gold' : 'violet')
          });
        }
      }
      spawn();

      var COLORS = {
        blue: [91, 158, 255],
        gold: [232, 200, 122],
        violet: [168, 130, 255]
      };

      function loop(now){
        if (!running) return;
        var dt = Math.min((now - lastT) / 16.67, 3);
        lastT = now;

        ctx.clearRect(0, 0, w, h);
        var cx = w / 2, cy = h / 2;

        var gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.42);
        gl.addColorStop(0, 'rgba(232,200,122,.20)');
        gl.addColorStop(0.4, 'rgba(91,158,255,.12)');
        gl.addColorStop(1, 'rgba(91,158,255,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(0, 0, w, h);

        for (var i = 0; i < parts.length; i++){
          var p = parts[i];
          p.life += dt;
          if (p.life > p.max){
            p.life = 0;
            p.ang = R(0, TAU);
            p.rad = Math.max(w, h) * R(0.62, 0.98);
          }
          p.rad -= p.radSpeed * dt;
          p.ang += p.angSpeed * dt;
          if (p.rad < 2){
            p.life = p.max + 1;
            continue;
          }

          var x = cx + Math.cos(p.ang) * p.rad;
          var y = cy + Math.sin(p.ang) * p.rad * 0.72;

          var k = 1 - p.life / p.max;
          var nearCenter = 1 - Math.min(1, p.rad / (Math.min(w, h) * 0.5));
          var alpha = Math.max(0, Math.min(1, k * 1.2)) * (0.35 + nearCenter * 0.65);

          var c = COLORS[p.hue];
          ctx.beginPath();
          ctx.arc(x, y, p.size * (0.6 + nearCenter * 0.8), 0, TAU);
          ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);

      function onResize(){
        env = fitCanvas(cvs);
        ctx = env.ctx; w = env.w; h = env.h;
        spawn();
      }
      window.addEventListener('resize', onResize);

      return function(){
        running = false;
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
      };
    }
  },

  /* ---------------- 07 时光胶片（隐藏款） ---------------- */
  {
    id: 'film',
    name: '时光胶片',
    hidden: true,
    html: [
      '<canvas class="cvs"></canvas>',
      '<div class="film-hole top"></div>',
      '<div class="film-hole bottom"></div>',
      '<div class="fm-flash"></div>',
      '<span class="fm-badge">HIDDEN</span>',
      '<div class="layer">',
        '<div class="fm-title">生日快乐</div>',
        '<div class="fm-name">致 · {{NAME}}</div>',
        '<div class="fm-date">{{DATE}}</div>',
      '</div>'
    ].join(''),
    init: function(root){
      var cvs = root.querySelector('.cvs');
      var env = fitCanvas(cvs);
      var ctx = env.ctx, w = env.w, h = env.h;
      var flash = root.querySelector('.fm-flash');

      var holes = root.querySelectorAll('.film-hole');
      holes.forEach(function(row){
        row.innerHTML = '';
        for (var i = 0; i < 14; i++){
          var s = document.createElement('i');
          row.appendChild(s);
        }
      });

      var flashColors = ['#FFFFFF', '#E8C87A', '#5B9EFF', '#000000'];
      var flashCount = 0;
      var flashTimer = setInterval(function(){
        if (!flash) return;
        flash.style.background = flashColors[RI(0, flashColors.length - 1)];
        flash.style.opacity = '0.82';
        setTimeout(function(){ if (flash) flash.style.opacity = '0'; }, 52);
        flashCount++;
        if (flashCount > 13) clearInterval(flashTimer);
      }, 108);

      var running = true;
      var raf = null;
      var lastT = performance.now();

      function loop(now){
        if (!running) return;
        var dt = Math.min((now - lastT) / 16.67, 3);
        lastT = now;

        ctx.clearRect(0, 0, w, h);

        var noiseCount = Math.round((w * h) / 2600);
        if (noiseCount > 900) noiseCount = 900;
        for (var i = 0; i < noiseCount; i++){
          var a = Math.random() * 0.13;
          ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
          ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
        }

        if (Math.random() < 0.18){
          var sx = Math.random() * w;
          ctx.fillStyle = 'rgba(255,255,255,.05)';
          ctx.fillRect(sx, 0, 1, h);
        }

        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);

      function onResize(){
        env = fitCanvas(cvs);
        ctx = env.ctx; w = env.w; h = env.h;
      }
      window.addEventListener('resize', onResize);

      return function(){
        running = false;
        if (raf) cancelAnimationFrame(raf);
        clearInterval(flashTimer);
        window.removeEventListener('resize', onResize);
      };
    }
  }

  ];

  /* ============================================================
     随机选择：普通 90% / 隐藏 10%
     ============================================================ */
  function pickRandom(){
    var normals = [], hiddens = [];
    FX.forEach(function(f, i){
      (f.hidden ? hiddens : normals).push(i);
    });
    var pool = (hiddens.length && Math.random() < 0.1) ? hiddens : normals;
    if (!pool.length) pool = normals.length ? normals : hiddens;
    return pool[RI(0, pool.length - 1)];
  }

  /* ============================================================
     挂载 / 卸载
     ============================================================ */
  var currentCleanup = null;
  var currentIndex = -1;

  function mount(container, options){
    options = options || {};
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return null;

    if (currentCleanup){
      try { currentCleanup(); } catch(e){}
      currentCleanup = null;
    }
    container.innerHTML = '';

    var idx = (typeof options.index === 'number' && options.index >= 0 && options.index < FX.length)
      ? options.index
      : pickRandom();

    var fx = FX[idx];
    var el = document.createElement('div');
    el.className = 'fx on';
    el.setAttribute('data-fx', fx.id);
    el.innerHTML = applyData(fx.html, options);
    container.appendChild(el);

    try {
      currentCleanup = fx.init(el) || null;
    } catch(e){
      console.warn('[SSBirthday] 效果初始化失败：', e);
      currentCleanup = null;
    }

    currentIndex = idx;

    return { index: idx, id: fx.id, name: fx.name, el: el };
  }

  function unmount(container){
    if (currentCleanup){
      try { currentCleanup(); } catch(e){}
      currentCleanup = null;
    }
    currentIndex = -1;
    if (container){
      if (typeof container === 'string') container = document.querySelector(container);
      if (container) container.innerHTML = '';
    }
  }

  /* ============================================================
     开屏控制器
     ============================================================ */
  function openScreen(options){
    options = options || {};
    var names = options.names || [];
    var nameStr = names.length ? names.join('、') : '你';
    var duration = typeof options.duration === 'number' ? options.duration : 6000;
    var btnDelay = typeof options.btnDelay === 'number' ? options.btnDelay : 1500;
    var onClose = typeof options.onClose === 'function' ? options.onClose : null;

    var stage = document.createElement('div');
    stage.className = 'bd-stage';
    stage.innerHTML =
      '<div class="bd-fx-host"></div>' +
      '<button class="bd-enter" type="button">' +
        '<span>进入星宸学社</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
      '</button>';
    document.body.appendChild(stage);

    var host = stage.querySelector('.bd-fx-host');
    var btn = stage.querySelector('.bd-enter');

    mount(host, { name: nameStr });
    playTune();

    var btnTimer = setTimeout(function(){
      if (btn) btn.classList.add('on');
    }, btnDelay);

    var autoTimer = setTimeout(close, duration);
    var closed = false;

    function close(){
      if (closed) return;
      closed = true;
      clearTimeout(btnTimer);
      clearTimeout(autoTimer);
      stage.classList.add('bd-out');
      unmount(host);
      if (onClose){
        try { onClose(); } catch(e){}
      }
      setTimeout(function(){
        if (stage.parentNode) stage.parentNode.removeChild(stage);
      }, 720);
    }

    btn.addEventListener('click', close);

    return { close: close, el: stage };
  }

  global.SSBirthday = {
    FX: FX,
    mount: mount,
    unmount: unmount,
    playTune: playBirthdayTune,
    ensureAudio: ensureAudio,
    pickRandom: pickRandom,
    checkBirthday: checkBirthday,
    solarToLunar: solarToLunar,
    openScreen: openScreen,
    get currentIndex(){ return currentIndex; }
  };

})(window);