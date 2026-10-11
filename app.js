const tabs = document.querySelector('#category-tabs');
const modeTabs = document.querySelector('#mode-tabs');
const panel = document.querySelector('#sample-panel');
const previousCategories = document.querySelector('#category-prev');
const nextCategories = document.querySelector('#category-next');
let groups = [];
let activeGroup = 0;
let waveforms = {};
let lastGroupByMode = {};
let sectionOrder = [];
const audioVersion = '20261003x';
const dataVersion = '20261011-scene03-content';

function groupMode(index) {
  return groups[index].mode;
}

function updateCategoryScroll() {
  previousCategories.hidden = tabs.scrollLeft <= 1;
  nextCategories.hidden = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 1;
}

function formatDuration(seconds) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function makeLabel(text) {
  const label = document.createElement('h4');
  label.className = 'sample-label';
  label.textContent = text;
  return label;
}

function makeAudio(src, label, seconds) {
  const wrap = document.createElement('div');
  wrap.className = 'audio-block';
  wrap.append(makeLabel(label));
  const audio = document.createElement('audio');
  audio.preload = 'none';
  audio.src = `${src}?v=${audioVersion}`;
  audio.setAttribute('aria-label', label);
  const player = document.createElement('div');
  player.className = 'audio-player';
  const play = document.createElement('button');
  play.className = 'play-button';
  play.type = 'button';
  play.setAttribute('aria-label', `Play ${label}`);
  play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="icon-play" d="M8 5.5v13l10-6.5z"/><path class="icon-pause" d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>';
  const timeline = document.createElement('input');
  timeline.className = 'audio-timeline';
  timeline.type = 'range';
  timeline.min = '0';
  timeline.max = String(seconds);
  timeline.step = '0.1';
  timeline.value = '0';
  timeline.disabled = true;
  timeline.setAttribute('aria-label', `Seek ${label}`);
  const track = document.createElement('div');
  track.className = 'player-track';
  const waveform = document.createElement('div');
  waveform.className = 'player-waveform';
  waveform.setAttribute('aria-hidden', 'true');
  for (const height of waveforms[src] || []) {
    const bar = document.createElement('span');
    bar.style.height = `${height}%`;
    waveform.append(bar);
  }
  track.append(waveform, timeline);
  const time = document.createElement('span');
  time.className = 'player-time';
  time.textContent = `0:00 / ${formatDuration(seconds)}`;

  function updateTime() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : seconds;
    const current = Math.min(audio.currentTime, duration);
    timeline.value = String(current);
    timeline.style.setProperty('--progress', `${duration ? current / duration * 100 : 0}%`);
    timeline.setAttribute('aria-valuetext', `${formatDuration(current)} of ${formatDuration(duration)}`);
    time.textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
  }

  audio.addEventListener('loadedmetadata', () => {
    timeline.max = String(audio.duration);
    timeline.disabled = false;
    updateTime();
  });
  audio.addEventListener('timeupdate', updateTime);
  audio.addEventListener('play', () => {
    play.classList.add('is-playing');
    play.setAttribute('aria-label', `Pause ${label}`);
  });
  audio.addEventListener('pause', () => {
    play.classList.remove('is-playing');
    play.setAttribute('aria-label', `Play ${label}`);
  });
  audio.addEventListener('error', () => {
    player.classList.add('has-error');
    time.textContent = 'Unavailable';
  });
  play.addEventListener('click', async () => {
    if (!audio.paused) {
      audio.pause();
      return;
    }
    document.querySelectorAll('audio').forEach(other => {
      if (other !== audio) other.pause();
    });
    if (audio.ended) audio.currentTime = 0;
    try {
      await audio.play();
      player.classList.remove('has-error');
      updateTime();
    } catch (error) {
      if (error.name === 'AbortError') return;
      player.classList.add('has-error');
      time.textContent = 'Unavailable';
    }
  });
  timeline.addEventListener('input', () => {
    audio.currentTime = Number(timeline.value);
    updateTime();
  });
  player.append(play, track, time);
  wrap.append(audio, player);
  return wrap;
}

function appendPromptMarkup(target, value, emphasizeSpeakers = false) {
  const markers = emphasizeSpeakers
    ? /<[^<>]+>|\bS([1-5])(?=\s*:)|Speaker([1-5])/g
    : /<[^<>]+>/g;
  let cursor = 0;
  for (const match of value.matchAll(markers)) {
    target.append(document.createTextNode(value.slice(cursor, match.index)));
    const isTag = match[0].startsWith('<');
    const marker = document.createElement(isTag ? 'strong' : 'span');
    marker.className = isTag ? 'prompt-tag' : `speaker-tag speaker-${match[1] || match[2]}`;
    marker.textContent = match[0];
    target.append(marker);
    cursor = match.index + match[0].length;
  }
  target.append(document.createTextNode(value.slice(cursor)));
}

function makeDescription(value, label) {
  const description = document.createElement('div');
  description.className = 'sample-description';
  const heading = makeLabel(label);
  description.append(heading);
  const fields = [...value.matchAll(/(?:Environment|Speaker|Content):\s*\{/g)];
  const sections = fields.length ? fields.map((field, index) => value.slice(field.index, fields[index + 1]?.index ?? value.length).trim()) : [value];
  for (const section of sections) {
    const prompt = document.createElement('p');
    prompt.className = 'prompt-text';
    const field = /^(Environment|Speaker|Content):\s*/.exec(section);
    if (field) {
      prompt.classList.add('is-structured');
      const fieldLabel = document.createElement('strong');
      fieldLabel.className = 'prompt-field-label';
      fieldLabel.textContent = `${field[1]}:`;
      const fieldValue = document.createElement('span');
      fieldValue.className = 'prompt-field-value';
      appendPromptMarkup(fieldValue, section.slice(field[0].length), field[1] === 'Speaker');
      prompt.append(fieldLabel, fieldValue);
    } else {
      appendPromptMarkup(prompt, section);
    }
    description.append(prompt);
  }
  return description;
}

function sampleRow(sample, group) {
  const row = document.createElement('li');
  row.className = `sample-row ${group.type === 'scene' ? 'is-scene' : group.type === 'reference' ? 'is-reference' : ''}`;
  if (sample.description) row.classList.add('has-description');
  const description = document.createElement('div');
  description.className = 'sample-input';
  if (sample.description) description.append(makeDescription(sample.description, 'Description'));
  row.append(description);
  const output = document.createElement('div');
  output.className = 'sample-output';
  output.append(makeAudio(sample.audio, group.type === 'scene' ? 'Audio' : 'Output', sample.duration));
  if (sample.references?.length) {
    const references = document.createElement('div');
    references.className = 'reference-list';
    if (sample.references.length > 1) {
      const referenceHeading = makeLabel('Reference audio');
      referenceHeading.classList.add('reference-heading');
      references.append(referenceHeading);
    }
    for (const reference of sample.references) {
      const label = sample.references.length === 1 && reference.label === 'Reference' ? 'Reference audio' : reference.label;
      const item = makeAudio(reference.audio, label, reference.duration);
      item.className = 'reference-item';
      references.append(item);
    }
    output.append(references);
  }
  row.append(output);
  return row;
}

function arrowIcon(direction) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === 'previous' ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'}"/></svg>`;
}

function renderSamples() {
  document.querySelectorAll('audio').forEach(audio => audio.pause());
  const group = groups[activeGroup];
  const list = document.createElement('div');
  list.className = 'sample-list';
  group.samples.forEach((sample, sampleIndex) => {
    const card = document.createElement('article');
    card.className = 'sample-card';
    card.dataset.sample = sample.number;
    const header = document.createElement('div');
    header.className = 'sample-header';
    const title = document.createElement('h3');
    title.textContent = group.label;
    const count = document.createElement('span');
    count.className = 'sample-count';
    count.textContent = `${String(sampleIndex + 1).padStart(2, '0')} / ${String(group.samples.length).padStart(2, '0')}`;
    header.append(title, count);
    const body = document.createElement('ul');
    body.className = 'sample-body';
    body.append(sampleRow(sample, group));
    card.append(header, body);
    list.append(card);
  });
  panel.replaceChildren(list, makeSectionPager());
}

function makeSectionPager() {
  const nav = document.createElement('nav');
  nav.className = 'section-pager';
  nav.setAttribute('aria-label', 'Section navigation');
  const current = sectionOrder.indexOf(activeGroup);
  const turnSection = index => {
    selectGroup(index);
    document.querySelector('#samples').scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
  };
  const previous = document.createElement('button');
  previous.className = 'section-button is-previous';
  previous.type = 'button';
  const previousIndex = sectionOrder[current - 1];
  previous.innerHTML = arrowIcon('previous');
  previous.append(document.createTextNode(previousIndex === undefined ? 'Previous section' : `Previous: ${groups[previousIndex].label}`));
  previous.disabled = previousIndex === undefined;
  if (previousIndex !== undefined) previous.addEventListener('click', () => turnSection(previousIndex));
  const next = document.createElement('button');
  next.className = 'section-button is-next';
  next.type = 'button';
  const nextIndex = sectionOrder[current + 1];
  next.append(document.createTextNode(nextIndex === undefined ? 'Next section' : `Next: ${groups[nextIndex].label}`));
  next.insertAdjacentHTML('beforeend', arrowIcon('next'));
  next.disabled = nextIndex === undefined;
  if (nextIndex !== undefined) next.addEventListener('click', () => turnSection(nextIndex));
  nav.append(previous, next);
  return nav;
}

function selectGroup(index, focusTab = false) {
  const mode = groupMode(index);
  document.querySelectorAll('audio').forEach(audio => audio.pause());
  activeGroup = index;
  lastGroupByMode[mode] = index;
  [...modeTabs.children].forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  [...tabs.children].forEach((tab, tabIndex) => {
    const selected = tabIndex === index;
    tab.hidden = groupMode(tabIndex) !== mode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  panel.setAttribute('aria-labelledby', `category-${index}`);
  renderSamples();
  const selectedTab = tabs.children[index];
  tabs.scrollTo({
    left: selectedTab.offsetLeft - tabs.offsetLeft - (tabs.clientWidth - selectedTab.offsetWidth) / 2,
    behavior: 'auto'
  });
  updateCategoryScroll();
  if (focusTab) tabs.children[index].focus();
}

function setupTabs() {
  const modes = [
    { key: 'scene', label: 'Audio Scenes' },
    { key: 'design', label: 'Voice Design' },
    { key: 'clone', label: 'Voice Clone' }
  ];
  sectionOrder = modes.flatMap(({ key }) => groups.map((_, index) => index).filter(index => groupMode(index) === key));
  modes.forEach(({ key, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mode = key;
    button.textContent = label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectGroup(lastGroupByMode[key]));
    modeTabs.append(button);
    lastGroupByMode[key] = groups.findIndex((_, index) => groupMode(index) === key);
  });
  groups.forEach((group, index) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = `category-${index}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', 'sample-panel');
    tab.textContent = group.label;
    tab.addEventListener('click', () => selectGroup(index));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const visibleIndices = groups.map((_, groupIndex) => groupIndex).filter(groupIndex => groupMode(groupIndex) === groupMode(activeGroup));
      const current = visibleIndices.indexOf(activeGroup);
      const next = event.key === 'Home' ? visibleIndices[0] : event.key === 'End' ? visibleIndices.at(-1) : visibleIndices[(current + (event.key === 'ArrowRight' ? 1 : -1) + visibleIndices.length) % visibleIndices.length];
      selectGroup(next, true);
    });
    tabs.append(tab);
  });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scrollCategories = direction => tabs.scrollBy({
    left: direction * tabs.clientWidth * 0.75,
    behavior: reducedMotion.matches ? 'auto' : 'smooth'
  });
  previousCategories.addEventListener('click', () => scrollCategories(-1));
  nextCategories.addEventListener('click', () => scrollCategories(1));
  tabs.addEventListener('scroll', updateCategoryScroll, { passive: true });
  window.addEventListener('resize', updateCategoryScroll);
  updateCategoryScroll();
  selectGroup(0);
}

Promise.all([
  fetch(`samples.json?v=${dataVersion}`).then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }),
  fetch(`waveforms.json?v=${dataVersion}`)
    .then(response => response.ok ? response.json() : {})
    .catch(() => ({}))
])
  .then(([data, peaks]) => {
    if (!Array.isArray(data.groups) || !data.groups.length) throw new Error('No samples available');
    waveforms = peaks;
    groups = data.groups;
    setupTabs();
  })
  .catch(() => {
    panel.textContent = 'Audio samples could not be loaded. Please refresh the page.';
    panel.className = 'sample-panel load-error';
  });
