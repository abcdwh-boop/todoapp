/* ==========================================================================
   TodoMemo 통합 앱 로직 (모바일/데스크톱 웹 공용)
   - 기존 3개 창(메인/큰달력/설정) 구조를 1페이지 3뷰로 통합
   - Electron IPC 의존 제거: 모든 동기화는 같은 페이지 내 함수 직접 호출
   ========================================================================== */

// ---------- 메인 뷰 DOM ----------
const dateDisplay = document.getElementById('date-display');
const prevDateBtn = document.getElementById('prev-date-btn');
const nextDateBtn = document.getElementById('next-date-btn');
const todayDateBtn = document.getElementById('today-date-btn');
const todoInput = document.getElementById('todo-input');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');
const toggleSmallCalBtn = document.getElementById('toggle-small-cal-btn');
const openLargeCalBtn = document.getElementById('open-large-cal-btn');
const openMenuBtn = document.getElementById('open-menu-btn');
const smallCalendarPanel = document.getElementById('small-calendar-panel');

// 작은 달력 DOM
const calPrevMonth = document.getElementById('cal-prev-month');
const calNextMonth = document.getElementById('cal-next-month');
const calMonthTitle = document.getElementById('cal-month-title');
const calGrid = document.getElementById('cal-grid');

// 드래프트 가드 모달 DOM
const draftModal = document.getElementById('draft-modal');
const draftSaveBtn = document.getElementById('draft-save-btn');
const draftDiscardBtn = document.getElementById('draft-discard-btn');
const draftCancelBtn = document.getElementById('draft-cancel-btn');

// 큰 달력 뷰 DOM
const largeCalView = document.getElementById('large-cal-view');
const largeCalBackBtn = document.getElementById('large-cal-back-btn');
const monthDisplay = document.getElementById('month-display');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const largeCalTodayBtn = document.getElementById('large-cal-today-btn');
const daysGrid = document.getElementById('days-grid');
const togglePassedX = document.getElementById('toggle-passed-x');

// 설정 뷰 DOM
const settingsView = document.getElementById('settings-view');
const settingsBackBtn = document.getElementById('settings-back-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const radioThemeDark = document.getElementById('theme-dark');
const radioThemeLight = document.getElementById('theme-light');
const checkboxAutoSave = document.getElementById('autosave-checkbox');
const radioInsertBottom = document.getElementById('insert-bottom');
const radioInsertTop = document.getElementById('insert-top');
const radioUsageTeacher = document.getElementById('use-teacher');
const radioUsageStudent = document.getElementById('use-student');
const radioUsageHome = document.getElementById('use-home');
const inputManagerName = document.getElementById('manager-name');
const inputManagerContact = document.getElementById('manager-contact');
const warningBox = document.getElementById('warning-box');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const exportDataBtn = document.getElementById('export-data-btn');
const importDataBtn = document.getElementById('import-data-btn');
const importFileInput = document.getElementById('import-file-input');

const toastEl = document.getElementById('toast');

// ---------- 상태 ----------
let selectedDate = '';
let smallCalYear = 0;
let smallCalMonth = 0;
let pendingTargetDate = '';
let isSmallCalOpen = false;
let activeDropdown = null;
let largeCalYear = 0;
let largeCalMonth = 0;

// ---------- 유틸 ----------
let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function closeActiveDropdown() {
  if (activeDropdown) {
    activeDropdown.classList.remove('open');
    activeDropdown = null;
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.todo-menu-container')) {
    closeActiveDropdown();
  }
});

// ---------- 초기 기동 ----------
window.addEventListener('DOMContentLoaded', async () => {
  await window.TaskRepository.init();

  // 브라우저가 임의로 로컬 데이터를 정리하지 않도록 영구 저장 요청
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  const today = new Date();
  selectedDate = window.CalendarService.formatDate(today);
  smallCalYear = today.getFullYear();
  smallCalMonth = today.getMonth();
  largeCalYear = today.getFullYear();
  largeCalMonth = today.getMonth();

  applyTheme();
  updateDateDisplay();
  renderTasks();
  loadSettingsForm();

  // 서비스워커 등록 (오프라인 사용)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => {
      console.warn('Service worker registration failed:', e);
    });
  }
});

// ---------- 데이터 변경 후 공통 갱신 ----------
function refreshAfterDataChange() {
  renderTasks();
  if (isSmallCalOpen) renderSmallCalendarDays();
  if (largeCalView.classList.contains('active')) renderLargeCalendar();
}

// ---------- 테마 ----------
function applyTheme() {
  const settings = window.TaskRepository.getSettings();
  document.body.classList.toggle('light-theme', settings.theme === 'light');
}

// ---------- 날짜 표시 ----------
function updateDateDisplay() {
  dateDisplay.textContent = selectedDate;
}

// ---------- 할 일 목록 렌더링 ----------
function renderTasks() {
  const tasks = window.TaskRepository.getTasksByDate(selectedDate);
  todoList.innerHTML = '';

  if (tasks.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  tasks.forEach((task) => {
    const li = document.createElement('li');
    li.className = `todo-item ${task.done ? 'done' : ''}`;
    li.dataset.id = task.id;

    // 메인 정보 행
    const mainRow = document.createElement('div');
    mainRow.className = 'todo-main-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo-checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => {
      window.TaskRepository.toggleDone(task.id);
      refreshAfterDataChange();
    });

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'todo-content-wrapper';

    const textSpan = document.createElement('span');
    textSpan.className = 'todo-text';
    textSpan.textContent = task.text;
    textSpan.addEventListener('dblclick', () => enableInlineEdit(li, task));
    contentWrapper.appendChild(textSpan);

    const memoIndicator = document.createElement('span');
    memoIndicator.className = 'todo-memo-indicator material-symbols-outlined';
    memoIndicator.textContent = 'description';
    memoIndicator.title = '상세 메모 있음';
    memoIndicator.style.fontSize = '14px';
    memoIndicator.style.display = task.memo ? 'inline-flex' : 'none';
    contentWrapper.appendChild(memoIndicator);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'todo-actions';

    const menuContainer = document.createElement('div');
    menuContainer.className = 'todo-menu-container';

    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'action-btn menu-trigger-btn';
    triggerBtn.innerHTML = '<span class="material-symbols-outlined">more_vert</span>';
    triggerBtn.title = '더보기';

    const menuPopup = document.createElement('div');
    menuPopup.className = 'todo-menu-popup';

    const menuMemoBtn = document.createElement('button');
    menuMemoBtn.className = 'todo-menu-item';
    menuMemoBtn.innerHTML = '<span class="material-symbols-outlined menu-icon">description</span> 상세 메모';

    const menuEditBtn = document.createElement('button');
    menuEditBtn.className = 'todo-menu-item';
    menuEditBtn.innerHTML = '<span class="material-symbols-outlined menu-icon">edit</span> 편집';

    const menuMoveBtn = document.createElement('button');
    menuMoveBtn.className = 'todo-menu-item';
    menuMoveBtn.innerHTML = '<span class="material-symbols-outlined menu-icon">arrow_forward</span> 내일로 이동';

    const menuDeleteBtn = document.createElement('button');
    menuDeleteBtn.className = 'todo-menu-item delete';
    menuDeleteBtn.innerHTML = '<span class="material-symbols-outlined menu-icon">delete</span> 삭제';

    menuPopup.appendChild(menuMemoBtn);
    menuPopup.appendChild(menuEditBtn);
    menuPopup.appendChild(menuMoveBtn);
    menuPopup.appendChild(menuDeleteBtn);
    menuContainer.appendChild(triggerBtn);
    menuContainer.appendChild(menuPopup);
    actionsDiv.appendChild(menuContainer);

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle material-symbols-outlined';
    dragHandle.textContent = 'drag_indicator';
    dragHandle.title = '드래그하여 순서 변경';
    attachDragReorder(dragHandle, li);

    mainRow.appendChild(dragHandle);
    mainRow.appendChild(checkbox);
    mainRow.appendChild(contentWrapper);
    mainRow.appendChild(actionsDiv);

    // 상세 메모 접이식 패널
    const memoPanel = document.createElement('div');
    memoPanel.className = 'todo-memo-panel';
    memoPanel.style.display = task.memoHidden ? 'none' : 'block';

    const memoTextarea = document.createElement('textarea');
    memoTextarea.className = 'todo-memo-textarea';
    memoTextarea.placeholder = '부연설명(상세 메모)을 입력하세요...';
    memoTextarea.value = task.memo || '';

    let saveTimeout = null;
    const saveMemo = () => {
      const val = memoTextarea.value;
      if (task.memo !== val) {
        window.TaskRepository.updateTask(task.id, { memo: val });
        task.memo = val;
        memoIndicator.style.display = val.trim() ? 'inline-flex' : 'none';
      }
    };
    memoTextarea.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveMemo, 1000);
    });
    memoTextarea.addEventListener('blur', saveMemo);
    memoPanel.appendChild(memoTextarea);

    // 삼점 메뉴 동작
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menuPopup.classList.contains('open');
      closeActiveDropdown();
      if (!isOpen) {
        menuPopup.classList.add('open');
        activeDropdown = menuPopup;
      }
    });

    menuMemoBtn.addEventListener('click', () => {
      closeActiveDropdown();
      const isHidden = memoPanel.style.display === 'none';
      if (isHidden) {
        memoPanel.style.display = 'block';
        window.TaskRepository.updateTask(task.id, { memoHidden: false });
        memoTextarea.focus();
      } else {
        memoPanel.style.display = 'none';
        window.TaskRepository.updateTask(task.id, { memoHidden: true });
        saveMemo();
      }
    });

    menuEditBtn.addEventListener('click', () => {
      closeActiveDropdown();
      enableInlineEdit(li, task);
    });

    menuMoveBtn.addEventListener('click', () => {
      closeActiveDropdown();
      const currentDate = window.CalendarService.parseDate(selectedDate);
      currentDate.setDate(currentDate.getDate() + 1);
      const tomorrowStr = window.CalendarService.formatDate(currentDate);
      window.TaskRepository.moveTaskToDate(task.id, tomorrowStr);
      refreshAfterDataChange();
      showToast('내일로 이동했습니다.');
    });

    menuDeleteBtn.addEventListener('click', () => {
      closeActiveDropdown();
      window.TaskRepository.deleteTask(task.id);
      refreshAfterDataChange();
    });

    li.appendChild(mainRow);
    li.appendChild(memoPanel);
    todoList.appendChild(li);
  });
}

// ---------- 드래그 순서 변경 (Pointer Events: 마우스+터치 공용) ----------
function attachDragReorder(handle, li) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    li.classList.add('dragging');
    document.body.classList.add('dragging-active');

    const onMove = (ev) => {
      const afterElement = getDragAfterElement(todoList, ev.clientY);
      if (afterElement == null) {
        todoList.appendChild(li);
      } else if (afterElement !== li) {
        todoList.insertBefore(li, afterElement);
      }
    };

    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      li.classList.remove('dragging');
      document.body.classList.remove('dragging-active');
      const taskIdOrderArray = Array.from(todoList.querySelectorAll('.todo-item')).map(el => el.dataset.id);
      window.TaskRepository.reorderTasks(selectedDate, taskIdOrderArray);
      refreshAfterDataChange();
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.todo-item:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ---------- 인라인 편집 ----------
function enableInlineEdit(li, task) {
  if (li.classList.contains('editing')) return;
  li.classList.add('editing');

  const contentWrapper = li.querySelector('.todo-content-wrapper');
  const todoActions = li.querySelector('.todo-actions');
  const originalText = task.text;

  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'todo-edit-input';
  editInput.value = originalText;

  todoActions.style.display = 'none';

  const editActionsDiv = document.createElement('div');
  editActionsDiv.className = 'edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'edit-btn';
  saveBtn.textContent = '저장';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel-btn';
  cancelBtn.textContent = '취소';

  editActionsDiv.appendChild(saveBtn);
  editActionsDiv.appendChild(cancelBtn);

  const saveChange = () => {
    const newText = editInput.value.trim();
    if (newText && newText !== originalText) {
      window.TaskRepository.updateTask(task.id, { text: newText });
    }
    refreshAfterDataChange();
  };
  const restoreItem = () => renderTasks();

  saveBtn.addEventListener('click', saveChange);
  cancelBtn.addEventListener('click', restoreItem);
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveChange();
    else if (e.key === 'Escape') restoreItem();
  });

  contentWrapper.innerHTML = '';
  contentWrapper.appendChild(editInput);
  li.appendChild(editActionsDiv);
  editInput.focus();
}

// ---------- 할 일 추가 ----------
function addNewTodo() {
  const text = todoInput.value.trim();
  if (!text) return;
  window.TaskRepository.addTask(selectedDate, text);
  todoInput.value = '';
  refreshAfterDataChange();
}

addBtn.addEventListener('click', addNewTodo);
todoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addNewTodo();
});

// ---------- 날짜 전환 보호 (DraftGuard) ----------
function requestDateChange(targetDateStr) {
  const draftText = todoInput.value.trim();
  if (draftText !== '') {
    pendingTargetDate = targetDateStr;
    draftModal.style.display = 'flex';
  } else {
    executeDateChange(targetDateStr);
  }
}

function executeDateChange(targetDateStr) {
  selectedDate = targetDateStr;
  updateDateDisplay();
  renderTasks();
  if (isSmallCalOpen) {
    const cur = window.CalendarService.parseDate(selectedDate);
    smallCalYear = cur.getFullYear();
    smallCalMonth = cur.getMonth();
    initSmallCalendarGrid();
  }
}

draftSaveBtn.addEventListener('click', () => {
  const draftText = todoInput.value.trim();
  if (draftText) {
    window.TaskRepository.addTask(selectedDate, draftText);
  }
  todoInput.value = '';
  draftModal.style.display = 'none';
  executeDateChange(pendingTargetDate);
});

draftDiscardBtn.addEventListener('click', () => {
  todoInput.value = '';
  draftModal.style.display = 'none';
  executeDateChange(pendingTargetDate);
});

draftCancelBtn.addEventListener('click', () => {
  draftModal.style.display = 'none';
  pendingTargetDate = '';
});

// ---------- 상단 날짜 이동 ----------
prevDateBtn.addEventListener('click', () => {
  const currentDate = window.CalendarService.parseDate(selectedDate);
  currentDate.setDate(currentDate.getDate() - 1);
  requestDateChange(window.CalendarService.formatDate(currentDate));
});

nextDateBtn.addEventListener('click', () => {
  const currentDate = window.CalendarService.parseDate(selectedDate);
  currentDate.setDate(currentDate.getDate() + 1);
  requestDateChange(window.CalendarService.formatDate(currentDate));
});

function goToToday() {
  const todayStr = window.CalendarService.formatDate(new Date());
  requestDateChange(todayStr);
  const today = new Date();
  smallCalYear = today.getFullYear();
  smallCalMonth = today.getMonth();
  if (isSmallCalOpen) initSmallCalendarGrid();
}

dateDisplay.addEventListener('click', goToToday);
todayDateBtn.addEventListener('click', goToToday);

// ---------- 작은 달력 ----------
toggleSmallCalBtn.addEventListener('click', () => {
  isSmallCalOpen = !isSmallCalOpen;
  if (isSmallCalOpen) {
    smallCalendarPanel.style.display = 'flex';
    toggleSmallCalBtn.classList.add('active');
    const curDate = window.CalendarService.parseDate(selectedDate);
    smallCalYear = curDate.getFullYear();
    smallCalMonth = curDate.getMonth();
    initSmallCalendarGrid();
  } else {
    smallCalendarPanel.style.display = 'none';
    toggleSmallCalBtn.classList.remove('active');
  }
});

function initSmallCalendarGrid() {
  calMonthTitle.textContent = `${smallCalYear}년 ${smallCalMonth + 1}월`;
  renderSmallCalendarDays();
}

function renderSmallCalendarDays() {
  calGrid.innerHTML = '';

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  weekdays.forEach((day) => {
    const div = document.createElement('div');
    div.className = 'cal-weekday';
    div.textContent = day;
    calGrid.appendChild(div);
  });

  const days = window.CalendarService.getMonthGrid(smallCalYear, smallCalMonth);
  const todayStr = window.CalendarService.formatDate(new Date());

  days.forEach((d) => {
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d.day;
    if (d.isCurrentMonth) cell.classList.add('current-month');
    if (d.dateString === todayStr) cell.classList.add('today');
    if (d.dateString === selectedDate) cell.classList.add('selected');
    if (d.dateString < todayStr) cell.classList.add('passed');
    cell.addEventListener('click', () => requestDateChange(d.dateString));
    calGrid.appendChild(cell);
  });
}

calPrevMonth.addEventListener('click', () => {
  if (smallCalMonth === 0) { smallCalMonth = 11; smallCalYear--; }
  else { smallCalMonth--; }
  initSmallCalendarGrid();
});

calNextMonth.addEventListener('click', () => {
  if (smallCalMonth === 11) { smallCalMonth = 0; smallCalYear++; }
  else { smallCalMonth++; }
  initSmallCalendarGrid();
});

// ==========================================================================
// 큰 달력 뷰 (기존 별도 창 → 전체화면 오버레이)
// ==========================================================================
openLargeCalBtn.addEventListener('click', () => {
  const cur = window.CalendarService.parseDate(selectedDate);
  largeCalYear = cur.getFullYear();
  largeCalMonth = cur.getMonth();
  const settings = window.TaskRepository.getSettings();
  togglePassedX.checked = !!settings.showPassedXLargeCal;
  renderLargeCalendar();
  largeCalView.classList.add('active');
});

largeCalBackBtn.addEventListener('click', () => {
  largeCalView.classList.remove('active');
});

togglePassedX.addEventListener('change', () => {
  window.TaskRepository.updateSettings({ showPassedXLargeCal: togglePassedX.checked });
  renderLargeCalendar();
});

function renderLargeCalendar() {
  monthDisplay.textContent = `${largeCalYear}년 ${largeCalMonth + 1}월`;
  daysGrid.innerHTML = '';

  const days = window.CalendarService.getMonthGrid(largeCalYear, largeCalMonth);
  const todayStr = window.CalendarService.formatDate(new Date());
  const settings = window.TaskRepository.getSettings();

  days.forEach((d) => {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (!d.isCurrentMonth) cell.classList.add('other-month');
    if (d.dateString === todayStr) cell.classList.add('today');
    if (d.dateString === selectedDate) cell.classList.add('selected');

    const numberDiv = document.createElement('div');
    numberDiv.className = 'day-number';
    numberDiv.textContent = d.day;
    if (settings.showPassedXLargeCal && d.dateString < todayStr) {
      numberDiv.classList.add('passed');
    }
    cell.appendChild(numberDiv);

    const tasks = window.TaskRepository.getTasksByDate(d.dateString);
    if (tasks.length > 0) {
      const todoListUl = document.createElement('ul');
      todoListUl.className = 'cell-todo-list';

      tasks.slice(0, 3).forEach((task) => {
        const itemLi = document.createElement('li');
        itemLi.className = `cell-todo-item ${task.done ? 'done' : ''}`;
        itemLi.textContent = `· ${window.CalendarService.truncateText(task.text, 10)}`;
        itemLi.title = task.text + (task.memo ? `\n(메모: ${task.memo})` : '');
        todoListUl.appendChild(itemLi);
      });

      if (tasks.length > 3) {
        const moreLi = document.createElement('li');
        moreLi.className = 'cell-more-count';
        moreLi.textContent = `+${tasks.length - 3}개 더`;
        todoListUl.appendChild(moreLi);
      }
      cell.appendChild(todoListUl);
    }

    // 날짜 셀 탭 → 달력 닫고 해당 날짜로 이동
    cell.addEventListener('click', () => {
      largeCalView.classList.remove('active');
      requestDateChange(d.dateString);
    });

    daysGrid.appendChild(cell);
  });
}

prevMonthBtn.addEventListener('click', () => {
  if (largeCalMonth === 0) { largeCalMonth = 11; largeCalYear--; }
  else { largeCalMonth--; }
  renderLargeCalendar();
});

nextMonthBtn.addEventListener('click', () => {
  if (largeCalMonth === 11) { largeCalMonth = 0; largeCalYear++; }
  else { largeCalMonth++; }
  renderLargeCalendar();
});

largeCalTodayBtn.addEventListener('click', () => {
  const today = new Date();
  largeCalYear = today.getFullYear();
  largeCalMonth = today.getMonth();
  renderLargeCalendar();
});

// ==========================================================================
// 설정(메뉴) 뷰 (기존 별도 창 → 전체화면 오버레이)
// ==========================================================================
openMenuBtn.addEventListener('click', () => {
  loadSettingsForm();
  settingsView.classList.add('active');
});

settingsBackBtn.addEventListener('click', () => {
  settingsView.classList.remove('active');
});

// 탭 전환
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tabPanes.forEach(pane => pane.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');
  });
});

function loadSettingsForm() {
  const settings = window.TaskRepository.getSettings();

  // 데스크톱(Electron)에서 실행 중일 때만 저장 경로 섹션 표시
  const storagePathSection = document.getElementById('storage-path-section');
  const storagePathDisplay = document.getElementById('storage-path-display');
  if (window.TaskRepository.isElectron && storagePathSection) {
    storagePathSection.style.display = 'block';
    if (storagePathDisplay) {
      storagePathDisplay.value = window.TaskRepository.getStorageDir();
    }
  }

  if (settings.theme === 'light') radioThemeLight.checked = true;
  else radioThemeDark.checked = true;

  checkboxAutoSave.checked = settings.autoSave !== false;

  if ((settings.insertPosition || 'bottom') === 'top') radioInsertTop.checked = true;
  else radioInsertBottom.checked = true;

  if (settings.usageType === 'class-student') radioUsageStudent.checked = true;
  else if (settings.usageType === 'home-homework') radioUsageHome.checked = true;
  else radioUsageTeacher.checked = true;

  inputManagerName.value = settings.managerName || '';
  inputManagerContact.value = settings.managerContact || '';

  toggleWarningBox(settings.usageType);
}

function toggleWarningBox(usageType) {
  warningBox.style.display =
    (usageType === 'class-student' || usageType === 'home-homework') ? 'block' : 'none';
}

document.querySelectorAll('input[name="usage-type"]').forEach((radio) => {
  radio.addEventListener('change', () => toggleWarningBox(radio.value));
});

saveSettingsBtn.addEventListener('click', () => {
  const theme = (document.querySelector('input[name="theme-type"]:checked') || {}).value || 'dark';
  const autoSave = checkboxAutoSave.checked;
  const insertPosition = (document.querySelector('input[name="insert-position"]:checked') || {}).value || 'bottom';
  const usageType = (document.querySelector('input[name="usage-type"]:checked') || {}).value || 'teacher-only';

  window.TaskRepository.updateSettings({
    theme,
    autoSave,
    insertPosition,
    usageType,
    managerName: inputManagerName.value.trim(),
    managerContact: inputManagerContact.value.trim()
  });

  applyTheme();
  settingsView.classList.remove('active');
  showToast('설정이 저장되었습니다.');
});

// ---------- 저장 경로 변경 (Electron 전용) ----------
const changeStoragePathBtn = document.getElementById('change-storage-path-btn');
if (changeStoragePathBtn) {
  changeStoragePathBtn.addEventListener('click', async () => {
    if (!window.TaskRepository.isElectron || !window.electronAPI || !window.electronAPI.selectDirectory) {
      showToast('저장 경로 변경은 데스크톱 앱에서만 가능합니다.');
      return;
    }
    const currentDir = window.TaskRepository.getStorageDir();
    const selectedDir = await window.electronAPI.selectDirectory(currentDir);
    if (selectedDir) {
      const success = window.TaskRepository.updateStoragePath(selectedDir);
      const display = document.getElementById('storage-path-display');
      if (success) {
        if (display) display.value = selectedDir;
        showToast('저장 경로가 변경되었습니다.');
      } else {
        showToast('저장 경로 변경에 실패했습니다.');
      }
    }
  });
}

// ---------- 데이터 백업 / 복원 ----------
exportDataBtn.addEventListener('click', () => {
  const json = window.TaskRepository.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const todayStr = window.CalendarService.formatDate(new Date());
  a.href = url;
  a.download = `todomemo_backup_${todayStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('백업 파일을 저장했습니다.');
});

importDataBtn.addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (!file) return;

  const proceed = confirm('백업 파일의 내용으로 현재 데이터를 덮어씁니다.\n계속하시겠습니까?');
  if (!proceed) {
    importFileInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = window.TaskRepository.importJSON(reader.result);
    if (result.success) {
      applyTheme();
      loadSettingsForm();
      refreshAfterDataChange();
    }
    showToast(result.message);
    importFileInput.value = '';
  };
  reader.onerror = () => {
    showToast('파일을 읽는 데 실패했습니다.');
    importFileInput.value = '';
  };
  reader.readAsText(file);
});
