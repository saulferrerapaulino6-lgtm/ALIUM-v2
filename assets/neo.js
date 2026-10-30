(() => {
  const stage = document.querySelector('#studio-stage');
  const rig = document.querySelector('#rig');
  const tabs = [...document.querySelectorAll('[data-part]')];
  const entries = {
    board:{n:'01',type:'PLACA BASE',title:'El núcleo del sistema.',copy:'Conecta procesador, memoria y gráfica para que todo trabaje en armonía.',fn:'Conectividad',image:'motherboard.png'},
    gpu:{n:'02',type:'TARJETA GRÁFICA',title:'Imágenes sin límites.',copy:'El músculo visual de tu PC: juegos fluidos, creación y detalle.',fn:'Gráficos',image:'gpu.png'},
    cooler:{n:'03',type:'REFRIGERACIÓN',title:'Rendimiento bajo control.',copy:'Mantiene el procesador en su temperatura ideal, incluso al exigirlo.',fn:'Temperatura',image:'cooler.png'},
    memory:{n:'04',type:'MEMORIA RAM',title:'Velocidad para avanzar.',copy:'Más espacio para jugar, crear y cambiar de tarea sin interrupciones.',fn:'Respuesta',image:'memory.png'}
  };
  let active='board', dragging=false, startX=0, startY=0, rotation=0, tilt=0;
  const select = id => {
    if(!entries[id]) return;
    active=id;
    const item=entries[id];
    document.querySelector('#part-number').textContent=item.n;
    document.querySelector('#part-type').textContent=item.type;
    document.querySelector('#part-name').textContent=item.title;
    document.querySelector('#part-description').textContent=item.copy;
    document.querySelector('#part-function').textContent=item.fn;
    document.querySelector('#spec-image img').src='assets/'+item.image;
    document.querySelector('#spec-image img').alt=item.type.toLowerCase();
    document.querySelectorAll('.dock-item').forEach(el=>el.classList.toggle('is-selected',el.dataset.part===id));
    document.querySelectorAll('.stage-hotspot').forEach(el=>el.classList.toggle('is-selected',el.dataset.part===id));
    document.querySelectorAll('.piece').forEach(el=>el.classList.toggle('is-selected',el.dataset.visual===id));
  };
  tabs.forEach(el=>el.addEventListener('click',()=>select(el.dataset.part)));
  document.querySelector('#next-part').addEventListener('click',()=>{const ids=Object.keys(entries);select(ids[(ids.indexOf(active)+1)%ids.length])});
  const renderRotation=()=>{rig.style.transform='rotateY('+rotation+'deg) rotateX('+tilt+'deg)';document.querySelector('#rotation-value').textContent=String(Math.round((rotation%360+360)%360)).padStart(2,'0')+'°'};
  stage.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;dragging=true;startX=event.clientX;startY=event.clientY;stage.classList.add('is-dragging');stage.setPointerCapture(event.pointerId)});
  stage.addEventListener('pointermove',event=>{if(!dragging)return;rotation+=(event.clientX-startX)*.48;tilt=Math.max(-9,Math.min(9,tilt+(event.clientY-startY)*-.14));startX=event.clientX;startY=event.clientY;renderRotation()});
  const stop=()=>{dragging=false;stage.classList.remove('is-dragging')};
  stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);
  document.querySelector('#view-toggle').addEventListener('click',event=>{const button=event.currentTarget;const assembled=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(assembled));rig.classList.toggle('is-assembled',assembled);document.querySelector('#view-label').textContent=assembled?'Vista explotada':'Vista ensamblada';button.querySelector('.toggle-icon').textContent=assembled?'◈':'⊞'});
  select('board');
})();
