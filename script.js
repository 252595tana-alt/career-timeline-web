/* 外部ライブラリ・外部通信なし。編集内容はブラウザ内と保存したHTMLに保持。 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const slides = [...document.querySelectorAll('.slide')];
  const editors = [...document.querySelectorAll('.editable')];
  const stage = $('stage'), viewport = document.querySelector('.viewport');
  const deck = document.querySelector('.deck');
  const original = JSON.parse($('original-source').textContent);
  const storageKey = ['web-slide',document.documentElement.dataset.documentId,document.documentElement.dataset.documentRevision].join(':');
  let current = 0, editing = false, storageAvailable = true, sessionDirty = false, exportDone = true;
  let saveTimer, toastTimer;
  const allowedTags = new Set(['P','SPAN','BR','DIV','B','STRONG','I','EM','U']);
  const allowedStyles = new Set(['font-size','font-weight','color','font-family','font-style','text-decoration','line-height','text-align','margin','margin-top','margin-bottom','letter-spacing']);

  function cleanHTML(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value);
    function walk(root) {
      for (const node of [...root.childNodes]) {
        if (node.nodeType === Node.COMMENT_NODE) { node.remove(); continue; }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (!allowedTags.has(node.tagName)) {
          if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META','SVG','IMG'].includes(node.tagName)) { node.remove(); continue; }
          walk(node); node.replaceWith(...node.childNodes); continue;
        }
        for (const attr of [...node.attributes]) if (attr.name !== 'style') node.removeAttribute(attr.name);
        for (const name of [...node.style]) {
          const val = node.style.getPropertyValue(name);
          if (!allowedStyles.has(name) || /url\(|expression\(|javascript:|@import/i.test(val)) node.style.removeProperty(name);
        }
        walk(node);
      }
    }
    walk(template.content);
    return template.innerHTML;
  }
  function snapshot() { return Object.fromEntries(editors.map(el => [el.id, cleanHTML(el.innerHTML)])); }
  function apply(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    for (const el of editors) if (typeof data[el.id] === 'string') el.innerHTML = cleanHTML(data[el.id]);
  }
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
  }
  function updateStatus(message) {
    $('status').textContent = message || (editing ? '編集モード' : '閲覧モード');
  }
  function persist() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(storageKey, JSON.stringify({version:1, values:snapshot(), savedAt:new Date().toISOString()}));
      storageAvailable = true;
      updateStatus(editing ? '編集中・このブラウザに保存済み' : 'このブラウザに保存済み');
    } catch {
      storageAvailable = false;
      updateStatus('ブラウザ保存が利用できません。「HTMLを保存」で保管してください。');
    }
  }
  function checkOverflow(el) {
    const box = el.parentElement;
    const tooWide = el.scrollWidth > el.clientWidth + 2;
    const tooTall = el.offsetHeight > box.clientHeight + 10;
    el.dataset.overflow = String(tooWide || tooTall);
    if (editing && (tooWide || tooTall)) updateStatus('文章が元の枠を超えています。文字量や改行を調整してください。');
    return tooWide || tooTall;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved?.version === 1 && saved.values) { apply(saved.values); updateStatus('このブラウザの編集内容を復元しました'); }
  } catch { storageAvailable = false; updateStatus('この環境ではブラウザ保存が使えません。HTMLを保存して保管してください。'); }

  function resize() {
    const styles = getComputedStyle(document.documentElement);
    const width = parseFloat(styles.getPropertyValue('--page-width'));
    const height = parseFloat(styles.getPropertyValue('--page-height'));
    const st = getComputedStyle(stage);
    const availableW = Math.max(1, stage.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight));
    const availableH = Math.max(1, stage.clientHeight - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom));
    const scale = $('zoom').value === 'fit' ? Math.min(availableW / width, availableH / height) : Number($('zoom').value);
    viewport.style.width = `${width * scale}px`; viewport.style.height = `${height * scale}px`;
    deck.style.transform = `scale(${scale})`;
  }
  function pageFromHash() {
    const match = location.hash.match(/^#page-(\d+)$/);
    return match ? Math.min(slides.length - 1, Math.max(0, Number(match[1]) - 1)) : 0;
  }
  function show(index, updateHash = true) {
    const navFocused = document.activeElement.closest?.('.pagination');
    current = Math.min(slides.length - 1, Math.max(0, index));
    slides.forEach((slide,i) => { slide.hidden = i !== current; });
    if (updateHash) { try { history.replaceState(null, '', `#page-${current+1}`); } catch { location.hash = `page-${current+1}`; } }
    if (navFocused) (slides[current].querySelector('button:not([hidden])') || slides[current]).focus({preventScroll:true});
  }
  slides.forEach((slide,index) => {
    slide.querySelectorAll('.pagination').forEach(node => node.remove());
    const pagination = document.createElement('nav'); pagination.className = 'pagination live-generated';
    pagination.setAttribute('aria-label','ページ切り替え');
    const back = document.createElement('button'); back.type='button'; back.textContent='戻る'; back.hidden=index===0;
    back.setAttribute('aria-label','前のページ'); back.addEventListener('click',()=>show(index-1));
    const count = document.createElement('span'); count.className='page-count'; count.textContent=`${index+1} / ${slides.length}`;
    count.setAttribute('aria-live','polite'); count.setAttribute('aria-atomic','true');
    const next = document.createElement('button'); next.type='button'; next.textContent='次へ'; next.hidden=index===slides.length-1;
    next.setAttribute('aria-label','次のページ'); next.addEventListener('click',()=>show(index+1));
    pagination.append(back,count,next); slide.append(pagination);
  });
  function setEditing(value) {
    editing = value; document.body.classList.toggle('editing',editing);
    $('edit-toggle').setAttribute('aria-pressed',String(editing));
    $('edit-toggle').textContent = editing ? '編集を終了' : '文字を編集';
    $('edit-help').hidden = !editing;
    for (const el of editors) {
      el.contentEditable = String(editing);
      if (editing) { el.setAttribute('role','textbox'); el.setAttribute('aria-multiline','true'); el.setAttribute('aria-label',el.dataset.label); el.tabIndex=0; }
      else { el.removeAttribute('role'); el.removeAttribute('aria-multiline'); el.removeAttribute('aria-label'); el.removeAttribute('tabindex'); }
    }
    if (!editing && sessionDirty) persist(); else updateStatus();
    requestAnimationFrame(resize);
  }
  $('edit-toggle').addEventListener('click',()=>setEditing(!editing));
  editors.forEach(el => {
    el.addEventListener('input',()=>{
      sessionDirty=true; exportDone=false; updateStatus('編集中…');
      clearTimeout(saveTimer); saveTimer=setTimeout(()=>{persist();checkOverflow(el);},350);
    });
    // Pasted documents must not insert scripts, images or external styles.
    el.addEventListener('paste',event=>{
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain') || '';
      document.execCommand('insertText',false,text);
    });
    el.addEventListener('drop',event=>event.preventDefault());
    el.addEventListener('blur',()=>{ if(sessionDirty) {persist();checkOverflow(el);} });
  });
  $('reset-original').addEventListener('click',()=>{
    if (!confirm('すべての文章を、最初に添付されたPowerPointの内容へ戻しますか？現在の編集内容は上書きされます。')) return;
    apply(original); sessionDirty=true; exportDone=false; persist();
    editors.forEach(el=>el.removeAttribute('data-overflow')); toast('元資料の文章に戻しました。');
  });
  $('save-html').addEventListener('click',()=>{
    persist();
    const overflows=editors.filter(el=>el.dataset.overflow==='true');
    if (overflows.length && !confirm('元の枠を超える文章があります。現在の表示のままHTMLを保存しますか？')) return;
    const clone=document.documentElement.cloneNode(true);
    clone.dataset.documentRevision=`export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    clone.querySelector('body').classList.remove('editing');
    clone.querySelectorAll('.live-generated').forEach(el=>el.remove());
    clone.querySelectorAll('.editable').forEach(el=>{
      el.innerHTML=cleanHTML(el.innerHTML); el.setAttribute('contenteditable','false');
      for(const name of ['role','aria-multiline','aria-label','tabindex','data-overflow']) el.removeAttribute(name);
    });
    clone.querySelector('#edit-toggle').textContent='文字を編集';
    clone.querySelector('#edit-toggle').setAttribute('aria-pressed','false');
    clone.querySelector('#edit-help').hidden=true; clone.querySelector('#toast').hidden=true;
    clone.querySelector('#status').textContent='閲覧モード';
    clone.querySelector('.viewport').removeAttribute('style'); clone.querySelector('.deck').removeAttribute('style');
    const zoom=clone.querySelector('#zoom'); [...zoom.options].forEach(option=>option.removeAttribute('selected')); zoom.options[0].setAttribute('selected','');
    clone.querySelectorAll('.slide').forEach((slide,i)=>{slide.hidden=i!==0;});
    const blob=new Blob(['<!doctype html>\n'+clone.outerHTML],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download='経歴・自己PR_編集済み.html'; document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    exportDone=true; toast('編集内容を含むHTMLを保存しました。保存したファイルを開くと編集内容が残ります。');
  });
  $('print').addEventListener('click',()=>{ if(editing) setEditing(false); window.print(); });
  $('fullscreen').addEventListener('click',async()=>{
    try { if(document.fullscreenElement) await document.exitFullscreen(); else if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else toast('このブラウザは全画面操作に対応していません。'); }
    catch { toast('全画面に切り替えられませんでした。ブラウザの全画面機能をご利用ください。'); }
  });
  $('exit-fullscreen').addEventListener('click',()=>document.exitFullscreen?.());
  $('zoom').addEventListener('change',resize);
  document.addEventListener('fullscreenchange',resize);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && editing){setEditing(false);return;}
    if((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='s'){event.preventDefault();$('save-html').click();return;}
    if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
    const actions={ArrowRight:current+1,PageDown:current+1,ArrowLeft:current-1,PageUp:current-1,Home:0,End:slides.length-1};
    if(Object.prototype.hasOwnProperty.call(actions,event.key)){event.preventDefault();show(actions[event.key]);}
  });
  window.addEventListener('hashchange',()=>show(pageFromHash(),false));
  window.addEventListener('resize',resize);
  window.addEventListener('beforeunload',event=>{
    if(sessionDirty) persist();
    if(sessionDirty && !storageAvailable && !exportDone){event.preventDefault();event.returnValue='';}
  });
  if(window.ResizeObserver)new ResizeObserver(resize).observe(stage);
  show(pageFromHash(),false); resize();
  document.fonts?.ready.then(resize);
})();
