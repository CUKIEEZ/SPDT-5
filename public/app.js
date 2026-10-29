(() => {
  const socket = io();
  const roomDescriptions = {
    umum: { title: 'umum', subtitle: 'Tempat ngobrol santai dan berbagi ide.', description: 'Ruang utama untuk berbagi cerita, ide, dan kabar terbaru bersama komunitas.' },
    teknologi: { title: 'teknologi', subtitle: 'Ngobrol tentang coding, tools, dan dunia digital.', description: 'Ruang untuk bertukar pengetahuan seputar pemrograman, teknologi, dan hal digital.' },
    random: { title: 'random', subtitle: 'Obrolan bebas, topik apa saja boleh.', description: 'Tempat santai untuk topik ringan, rekomendasi, dan percakapan spontan.' }
  };
  const roomColors = ['purple', 'teal', 'pink', 'blue', 'gold', 'rose'];
  const state = { username: '', room: 'umum', users: [], typing: new Map(), connected: false, dayLabel: '' };

  const $ = (id) => document.getElementById(id);
  const ui = {
    joinOverlay: $('join-overlay'), joinForm: $('join-form'), usernameInput: $('username-input'),
    profileName: $('profile-name'), profileAvatar: $('profile-avatar'), currentRoomTitle: $('current-room-title'),
    roomSubtitle: $('room-subtitle'), aboutRoomTitle: $('about-room-title'), aboutRoomDescription: $('about-room-description'),
    messageArea: $('message-area'), messageList: $('message-list'), welcomeBlock: $('welcome-block'),
    messageForm: $('message-form'), messageInput: $('message-input'), membersList: $('members-list'),
    memberBadge: $('member-badge'), headerOnlineCount: $('header-online-count'), sidebarStatus: $('sidebar-status'),
    typingRow: $('typing-row'), typingText: $('typing-text'), emojiPicker: $('emoji-picker'), toast: $('toast')
  };

  function initials(name) {
    return String(name).trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || 'GU';
  }

  function colorFor(name) {
    let hash = 0;
    for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return roomColors[hash % roomColors.length];
  }

  function timeLabel(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function dayLabel(iso) {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'HARI INI';
    if (date.toDateString() === yesterday.toDateString()) return 'KEMARIN';
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  }

  function showToast(message, isError = false) {
    ui.toast.textContent = message;
    ui.toast.classList.toggle('error', isError);
    ui.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => ui.toast.classList.remove('show'), 2800);
  }

  function avatarElement(name, className = 'avatar') {
    const avatar = document.createElement('span');
    avatar.className = `${className} avatar-${colorFor(name)}`;
    avatar.textContent = initials(name);
    avatar.setAttribute('aria-hidden', 'true');
    return avatar;
  }

  function renderUsers(users) {
    state.users = users || [];
    ui.membersList.replaceChildren();
    if (!state.users.length) {
      const empty = document.createElement('div');
      empty.className = 'member-loading'; empty.textContent = 'Belum ada anggota online.';
      ui.membersList.append(empty);
    } else {
      state.users.forEach(user => {
        const item = document.createElement('div'); item.className = 'member-item';
        item.append(avatarElement(user.username));
        const copy = document.createElement('div'); copy.className = 'member-copy';
        const name = document.createElement('strong'); name.textContent = user.username + (user.id === socket.id ? ' (kamu)' : '');
        const status = document.createElement('small'); status.textContent = 'Sedang online';
        copy.append(name, status);
        const dot = document.createElement('span'); dot.className = 'member-status'; dot.title = 'Online';
        item.append(copy, dot); ui.membersList.append(item);
      });
    }
    const count = state.users.length;
    ui.memberBadge.textContent = String(count);
    ui.headerOnlineCount.textContent = `${count} online`;
    $('about-online-stat').textContent = String(count);
    Object.keys(roomDescriptions).forEach(room => {
      const countElement = $(`count-${room}`);
      if (countElement) countElement.textContent = room === state.room ? String(count) : countElement.textContent;
    });
  }

  function renderSystem(text, timestamp) {
    if (ui.welcomeBlock) ui.welcomeBlock.hidden = true;
    const event = document.createElement('div'); event.className = 'system-event';
    event.textContent = `${text} · ${timeLabel(timestamp)}`;
    ui.messageList.append(event);
    scrollToBottom();
  }

  function renderDayIfNeeded(timestamp) {
    const label = dayLabel(timestamp);
    if (label === state.dayLabel) return;
    state.dayLabel = label;
    const divider = document.createElement('div'); divider.className = 'message-day';
    const span = document.createElement('span'); span.textContent = label;
    divider.append(span); ui.messageList.append(divider);
  }

  function renderMessage(message) {
    if (ui.welcomeBlock) ui.welcomeBlock.hidden = true;
    renderDayIfNeeded(message.timestamp);
    const own = message.senderId === socket.id;
    const row = document.createElement('article'); row.className = `message-row${own ? ' own' : ''}`;
    row.append(avatarElement(message.username));
    const content = document.createElement('div'); content.className = 'message-content';
    const meta = document.createElement('div'); meta.className = 'message-meta';
    const sender = document.createElement('strong'); sender.textContent = own ? 'Kamu' : message.username;
    const time = document.createElement('time'); time.textContent = timeLabel(message.timestamp); time.dateTime = message.timestamp;
    meta.append(sender, time);
    const bubble = document.createElement('div'); bubble.className = 'message-bubble'; bubble.textContent = message.text;
    content.append(meta, bubble);
    row.append(content);
    ui.messageList.append(row);
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { ui.messageArea.scrollTop = ui.messageArea.scrollHeight; });
  }

  function clearMessages() {
    ui.messageList.replaceChildren();
    state.dayLabel = '';
    if (ui.welcomeBlock) ui.welcomeBlock.hidden = false;
  }

  function setRoom(room) {
    const info = roomDescriptions[room] || roomDescriptions.umum;
    state.room = room;
    ui.currentRoomTitle.textContent = info.title;
    ui.roomSubtitle.textContent = info.subtitle;
    ui.aboutRoomTitle.textContent = `# ${info.title}`;
    ui.aboutRoomDescription.textContent = info.description;
    ui.messageInput.placeholder = `Kirim pesan ke #${info.title}...`;
    document.querySelectorAll('.room-link').forEach(button => button.classList.toggle('active', button.dataset.room === room));
    document.querySelectorAll('.join-room-option').forEach(label => {
      const input = label.querySelector('input');
      label.classList.toggle('selected', Boolean(input && input.value === room));
    });
  }

  function joinRoom(username, room) {
    state.username = username;
    ui.profileName.textContent = username;
    ui.profileAvatar.textContent = initials(username);
    setRoom(room);
    socket.emit('join-room', { username, room });
    ui.joinOverlay.classList.add('hidden');
    ui.messageInput.focus();
  }

  function updateTyping() {
    const names = [...state.typing.values()].filter(Boolean);
    if (!names.length) {
      ui.typingRow.style.visibility = 'hidden';
      ui.typingText.textContent = '';
      return;
    }
    ui.typingRow.style.visibility = 'visible';
    ui.typingText.textContent = names.length === 1 ? `${names[0]} sedang mengetik...` : `${names.slice(0, 2).join(' dan ')} sedang mengetik...`;
  }

  ui.joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = ui.usernameInput.value.trim().replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, 24);
    if (username.length < 2) { showToast('Nama tampilan minimal 2 karakter.', true); ui.usernameInput.focus(); return; }
    const selectedRoom = new FormData(ui.joinForm).get('join-room') || 'umum';
    joinRoom(username, selectedRoom);
  });

  document.querySelectorAll('.room-link').forEach(button => {
    button.addEventListener('click', () => {
      const room = button.dataset.room;
      if (room === state.room) return;
      state.typing.clear(); updateTyping(); clearMessages(); setRoom(room);
      socket.emit('join-room', { username: state.username || 'Pengguna', room });
    });
  });

  ui.messageForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = ui.messageInput.value.trim();
    if (!text) return;
    if (!state.connected) { showToast('Server belum terhubung. Coba lagi sebentar.', true); return; }
    socket.emit('chat-message', text);
    ui.messageInput.value = '';
    socket.emit('typing', false);
    ui.messageInput.focus();
  });

  let typingTimeout;
  ui.messageInput.addEventListener('input', () => {
    socket.emit('typing', Boolean(ui.messageInput.value.trim()));
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 1200);
  });
  ui.messageInput.addEventListener('keydown', event => {
    if (event.key === 'Escape') ui.emojiPicker.hidden = true;
  });

  $('emoji-toggle').addEventListener('click', () => { ui.emojiPicker.hidden = !ui.emojiPicker.hidden; });
  ui.emojiPicker.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    ui.messageInput.value += button.textContent;
    ui.messageInput.focus();
    ui.emojiPicker.hidden = true;
    socket.emit('typing', true);
  }));
  document.addEventListener('click', event => {
    if (!ui.emojiPicker.contains(event.target) && event.target.id !== 'emoji-toggle') ui.emojiPicker.hidden = true;
  });
  $('focus-composer').addEventListener('click', () => ui.messageInput.focus());
  $('dismiss-announcement').addEventListener('click', () => document.querySelector('.announcement').remove());
  $('edit-profile').addEventListener('click', () => {
    ui.usernameInput.value = state.username || '';
    ui.joinOverlay.classList.remove('hidden');
    const selectedRadio = ui.joinForm.querySelector(`input[name="join-room"][value="${state.room}"]`);
    if (selectedRadio) selectedRadio.checked = true;
    document.querySelectorAll('.join-room-option').forEach(label => label.classList.toggle('selected', label.querySelector('input').checked));
    ui.usernameInput.focus();
  });
  $('join-close').addEventListener('click', () => {
    if (state.username) ui.joinOverlay.classList.add('hidden');
    else showToast('Masukkan nama untuk bergabung.', true);
  });
  $('mobile-members').addEventListener('click', () => showToast(`${state.users.length} anggota sedang online.`));

  socket.on('connect', () => {
    state.connected = true;
    ui.sidebarStatus.textContent = 'Server terhubung';
    if (state.username) socket.emit('join-room', { username: state.username, room: state.room });
  });
  socket.on('disconnect', () => {
    state.connected = false;
    ui.sidebarStatus.textContent = 'Koneksi terputus';
    showToast('Koneksi terputus. Mencoba menyambungkan kembali...', true);
  });
  socket.on('connect_error', () => {
    state.connected = false;
    ui.sidebarStatus.textContent = 'Gagal menghubungkan';
  });
  socket.on('room-joined', data => {
    setRoom(data.room);
    clearMessages();
    (data.history || []).forEach(renderMessage);
    renderUsers(data.users || []);
    state.typing.clear(); updateTyping();
    if (!data.history?.length && ui.welcomeBlock) ui.welcomeBlock.hidden = false;
    scrollToBottom();
  });
  socket.on('chat-message', renderMessage);
  socket.on('system-message', message => renderSystem(message.text, message.timestamp));
  socket.on('users-updated', renderUsers);
  socket.on('room-counts', counts => {
    Object.keys(roomDescriptions).forEach(room => {
      const countElement = $(`count-${room}`);
      if (countElement) countElement.textContent = String(counts[room] || 0);
    });
  });
  socket.on('user-typing', payload => {
    if (payload.isTyping) state.typing.set(payload.id, payload.username);
    else state.typing.delete(payload.id);
    updateTyping();
  });

  setRoom('umum');
  ui.typingRow.style.visibility = 'hidden';
  ui.usernameInput.focus();
})();
