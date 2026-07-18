class TaskRepository {
  constructor() {
    this.data = {
      version: 1,
      settings: {
        autoSave: true,
        usageType: 'teacher-only',
        managerName: '',
        managerContact: '',
        theme: 'dark',
        insertPosition: 'bottom',
        showPassedXLargeCal: false
      },
      tasksByDate: {}
    };
    this.filePath = null;
    this.bakFilePath = null;
    this.tmpFilePath = null;
    this.isInitialized = false;
    this.isElectron = !!(window.electronAPI && window.fileSystem);
  }

  async init() {
    this.isElectron = !!(window.electronAPI && window.fileSystem);
    if (this.isElectron) {
      try {
        let appDir = localStorage.getItem('todomemo_custom_path');
        if (!appDir) {
          const docsPath = await window.electronAPI.getDocumentsPath();
          appDir = window.fileSystem.joinPath(docsPath, 'TodoMemoApp');
        }
        
        if (!window.fileSystem.existsSync(appDir)) {
          window.fileSystem.mkdirSync(appDir);
        }

        this.filePath = window.fileSystem.joinPath(appDir, 'tasks.json');
        this.bakFilePath = window.fileSystem.joinPath(appDir, 'tasks.json.bak');
        this.tmpFilePath = window.fileSystem.joinPath(appDir, 'tasks.json.tmp');

        this.loadTasks();
        this.isInitialized = true;
      } catch (error) {
        console.error('Failed to initialize TaskRepository via Electron:', error);
        this.loadTasksMobile();
        this.isInitialized = true;
      }
    } else {
      this.loadTasksMobile();
      this.isInitialized = true;
    }
  }

  loadTasksMobile() {
    try {
      const content = localStorage.getItem('todomemo_data');
      if (content) {
        this.data = JSON.parse(content);
      } else {
        this.saveTasksInternal();
      }
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
    }
    if (!this.data.tasksByDate) this.data.tasksByDate = {};
    if (!this.data.settings) {
      this.data.settings = {
        autoSave: true,
        usageType: 'teacher-only',
        managerName: '',
        managerContact: '',
        theme: 'dark',
        insertPosition: 'bottom',
        showPassedXLargeCal: false
      };
    } else {
      if (!this.data.settings.insertPosition) this.data.settings.insertPosition = 'bottom';
      if (this.data.settings.showPassedXLargeCal === undefined) this.data.settings.showPassedXLargeCal = false;
    }
  }

  loadTasks() {
    if (!this.isElectron) {
      this.loadTasksMobile();
      return;
    }
    if (!this.filePath) return;

    if (!window.fileSystem.existsSync(this.filePath)) {
      this.saveTasksInternal();
      return;
    }

    try {
      const content = window.fileSystem.readFileSync(this.filePath);
      this.data = JSON.parse(content);
      
      if (!this.data.tasksByDate) this.data.tasksByDate = {};
      if (!this.data.settings) {
        this.data.settings = {
          autoSave: true,
          usageType: 'teacher-only',
          managerName: '',
          managerContact: '',
          theme: 'dark',
          insertPosition: 'bottom',
          showPassedXLargeCal: false
        };
      } else {
        if (!this.data.settings.theme) this.data.settings.theme = 'dark';
        if (!this.data.settings.insertPosition) this.data.settings.insertPosition = 'bottom';
        if (this.data.settings.showPassedXLargeCal === undefined) this.data.settings.showPassedXLargeCal = false;
      }
    } catch (error) {
      console.error('Failed to parse tasks.json, trying recovery from backup:', error);
      this.recoverFromBackup();
    }
  }

  recoverFromBackup() {
    if (this.isElectron && window.fileSystem && window.fileSystem.existsSync(this.bakFilePath)) {
      try {
        const content = window.fileSystem.readFileSync(this.bakFilePath);
        this.data = JSON.parse(content);
        this.saveTasksInternal();
        alert('메모 데이터가 손상되어 백업 파일(tasks.json.bak)로부터 복구했습니다.');
      } catch (bakError) {
        console.error('Backup file is also broken:', bakError);
        alert('백업 데이터마저 손상되어 데이터 초기화 상태로 기동합니다.');
        this.resetData();
      }
    } else {
      this.resetData();
    }
  }

  resetData() {
    this.data = {
      version: 1,
      settings: {
        autoSave: true,
        usageType: 'teacher-only',
        managerName: '',
        managerContact: '',
        theme: 'dark',
        insertPosition: 'bottom',
        showPassedXLargeCal: false
      },
      tasksByDate: {}
    };
    this.saveTasksInternal();
  }

  saveTasksInternal() {
    if (this.isElectron) {
      if (!this.filePath) return;

      try {
        const jsonString = JSON.stringify(this.data, null, 2);
        window.fileSystem.writeFileSync(this.tmpFilePath, jsonString);
        
        if (window.fileSystem.existsSync(this.filePath)) {
          try {
            const currentContent = window.fileSystem.readFileSync(this.filePath);
            window.fileSystem.writeFileSync(this.bakFilePath, currentContent);
          } catch (e) {
            console.warn('Could not create backup before overwrite:', e);
          }
        }
        
        window.fileSystem.renameSync(this.tmpFilePath, this.filePath);
        if (window.electronAPI && window.electronAPI.notifyTasksUpdated) {
          window.electronAPI.notifyTasksUpdated();
        }
      } catch (error) {
        console.error('Failed to save tasks atomically:', error);
      }
    } else {
      try {
        localStorage.setItem('todomemo_data', JSON.stringify(this.data));
      } catch (e) {
        console.error('Failed to save tasks to localStorage:', e);
      }
    }
  }

  saveTasks() {
    if (this.data.settings.autoSave) {
      this.saveTasksInternal();
    }
  }

  getTasksByDate(date) {
    const list = this.data.tasksByDate[date] || [];
    return [...list].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.createdAt;
      const orderB = b.order !== undefined ? b.order : b.createdAt;
      return orderA - orderB;
    });
  }

  generateId() {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
  }

  addTask(date, text) {
    if (!this.data.tasksByDate[date]) {
      this.data.tasksByDate[date] = [];
    }

    const list = this.data.tasksByDate[date];
    const settings = this.getSettings();
    const insertAtTop = settings.insertPosition === 'top';

    let order = Date.now();
    if (list.length > 0) {
      const sortedList = this.getTasksByDate(date);
      if (insertAtTop) {
        const firstOrder = sortedList[0].order !== undefined ? sortedList[0].order : sortedList[0].createdAt;
        order = firstOrder - 1000;
      } else {
        const lastOrder = sortedList[sortedList.length - 1].order !== undefined ? sortedList[sortedList.length - 1].order : sortedList[sortedList.length - 1].createdAt;
        order = lastOrder + 1000;
      }
    }

    const newTask = {
      id: this.generateId(),
      text: text.trim(),
      done: false,
      memoHidden: true,
      memo: '',
      createdAt: Date.now(),
      order: order
    };

    this.data.tasksByDate[date].push(newTask);
    this.saveTasks();
    return newTask;
  }

  reorderTasks(date, taskIdOrderArray) {
    const list = this.data.tasksByDate[date] || [];
    const taskMap = new Map(list.map(t => [t.id, t]));
    const newList = [];
    taskIdOrderArray.forEach((id, index) => {
      const task = taskMap.get(id);
      if (task) {
        task.order = index;
        newList.push(task);
      }
    });
    // Add any remaining tasks that weren't in the list
    list.forEach(t => {
      if (!taskIdOrderArray.includes(t.id)) {
        t.order = newList.length;
        newList.push(t);
      }
    });
    this.data.tasksByDate[date] = newList;
    this.saveTasks();
  }

  updateTask(taskId, patch) {
    let found = false;
    for (const date in this.data.tasksByDate) {
      const index = this.data.tasksByDate[date].findIndex(t => t.id === taskId);
      if (index !== -1) {
        this.data.tasksByDate[date][index] = {
          ...this.data.tasksByDate[date][index],
          ...patch
        };
        found = true;
        break;
      }
    }
    if (found) {
      this.saveTasks();
    }
    return found;
  }

  deleteTask(taskId) {
    let found = false;
    for (const date in this.data.tasksByDate) {
      const index = this.data.tasksByDate[date].findIndex(t => t.id === taskId);
      if (index !== -1) {
        this.data.tasksByDate[date].splice(index, 1);
        if (this.data.tasksByDate[date].length === 0) {
          delete this.data.tasksByDate[date];
        }
        found = true;
        break;
      }
    }
    if (found) {
      this.saveTasks();
    }
    return found;
  }

  moveTaskToDate(taskId, targetDate) {
    let taskToMove = null;
    let found = false;
    for (const date in this.data.tasksByDate) {
      const index = this.data.tasksByDate[date].findIndex(t => t.id === taskId);
      if (index !== -1) {
        taskToMove = this.data.tasksByDate[date].splice(index, 1)[0];
        if (this.data.tasksByDate[date].length === 0) {
          delete this.data.tasksByDate[date];
        }
        found = true;
        break;
      }
    }
    if (found && taskToMove) {
      if (!this.data.tasksByDate[targetDate]) {
        this.data.tasksByDate[targetDate] = [];
      }
      this.data.tasksByDate[targetDate].push(taskToMove);
      this.saveTasks();
      return true;
    }
    return false;
  }

  toggleDone(taskId) {
    let found = false;
    for (const date in this.data.tasksByDate) {
      const index = this.data.tasksByDate[date].findIndex(t => t.id === taskId);
      if (index !== -1) {
        this.data.tasksByDate[date][index].done = !this.data.tasksByDate[date][index].done;
        found = true;
        break;
      }
    }
    if (found) {
      this.saveTasks();
    }
    return found;
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    this.data.settings = {
      ...this.data.settings,
      ...patch
    };
    this.saveTasksInternal();
  }

  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  importJSON(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      return { success: false, message: '올바른 JSON 형식의 파일이 아닙니다.' };
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.tasksByDate !== 'object') {
      return { success: false, message: 'TodoMemo 백업 파일 형식이 아닙니다.' };
    }
    this.data = parsed;
    if (!this.data.settings) {
      this.data.settings = {
        autoSave: true, usageType: 'teacher-only', managerName: '', managerContact: '',
        theme: 'dark', insertPosition: 'bottom', showPassedXLargeCal: false
      };
    }
    this.saveTasksInternal();
    return { success: true, message: '백업 데이터를 성공적으로 복원했습니다.' };
  }

  getStorageDir() {
    if (this.filePath) {
      const lastSlash = Math.max(this.filePath.lastIndexOf('/'), this.filePath.lastIndexOf('\\'));
      if (lastSlash !== -1) {
        return this.filePath.substring(0, lastSlash);
      }
    }
    return '';
  }

  updateStoragePath(newPath) {
    if (!this.isElectron) return false;
    try {
      if (!window.fileSystem.existsSync(newPath)) {
        window.fileSystem.mkdirSync(newPath);
      }
      
      const newFilePath = window.fileSystem.joinPath(newPath, 'tasks.json');
      const newBakFilePath = window.fileSystem.joinPath(newPath, 'tasks.json.bak');
      const newTmpFilePath = window.fileSystem.joinPath(newPath, 'tasks.json.tmp');

      if (window.fileSystem.existsSync(newFilePath)) {
        try {
          const content = window.fileSystem.readFileSync(newFilePath);
          this.data = JSON.parse(content);
        } catch (e) {
          console.error('Failed to read tasks.json in new path, overwriting with current data', e);
        }
      }

      this.filePath = newFilePath;
      this.bakFilePath = newBakFilePath;
      this.tmpFilePath = newTmpFilePath;
      
      this.saveTasksInternal();
      localStorage.setItem('todomemo_custom_path', newPath);
      return true;
    } catch (error) {
      console.error('Failed to update storage path:', error);
      return false;
    }
  }
}

window.TaskRepository = new TaskRepository();
