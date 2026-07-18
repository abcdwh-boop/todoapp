class CalendarService {
  /**
   * Date 객체를 YYYY-MM-DD 형식의 문자열로 변환
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * YYYY-MM-DD 문자열을 Date 객체로 변환
   */
  parseDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * 지정한 연/월의 달력 그리드 데이터 생성
   * @param {number} year - 연도 (예: 2026)
   * @param {number} month - 월 (0 ~ 11, JS Month 형식)
   * @returns {Array} 35개 또는 42개의 날짜 객체 배열
   */
  getMonthGrid(year, month) {
    const grid = [];
    
    // 해당 월의 1일 요일 (0: 일, 1: 월, ...)
    const firstDayIndex = new Date(year, month, 1).getDay();
    
    // 해당 월의 마지막 날짜
    const lastDate = new Date(year, month + 1, 0).getDate();
    
    // 이전 월의 마지막 날짜
    const prevLastDate = new Date(year, month, 0).getDate();
    
    // 1. 이전 달 날짜 채우기 (첫 주 공백 영역)
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDay = prevLastDate - i;
      const prevDate = new Date(year, month - 1, prevDay);
      grid.push({
        dateString: this.formatDate(prevDate),
        day: prevDay,
        isCurrentMonth: false,
        year: prevDate.getFullYear(),
        month: prevDate.getMonth()
      });
    }

    // 2. 현재 월 날짜 채우기
    for (let i = 1; i <= lastDate; i++) {
      const currDate = new Date(year, month, i);
      grid.push({
        dateString: this.formatDate(currDate),
        day: i,
        isCurrentMonth: true,
        year,
        month
      });
    }

    // 3. 다음 달 날짜 채우기 (마지막 주 빈 영역)
    // 달력 행 수 조정을 위해 그리드 크기를 7의 배수로 맞춤 (보통 5주 35개 또는 6주 42개)
    const totalCells = grid.length <= 35 ? 35 : 42;
    const nextCellsCount = totalCells - grid.length;
    for (let i = 1; i <= nextCellsCount; i++) {
      const nextDate = new Date(year, month + 1, i);
      grid.push({
        dateString: this.formatDate(nextDate),
        day: i,
        isCurrentMonth: false,
        year: nextDate.getFullYear(),
        month: nextDate.getMonth()
      });
    }

    return grid;
  }

  /**
   * 텍스트가 지정 길이 초과 시 말줄임 처리
   */
  truncateText(text, limit = 10) {
    if (!text) return '';
    if (text.length <= limit) return text;
    return text.substring(0, limit) + '...';
  }
}

// 전역 싱글톤으로 제공
window.CalendarService = new CalendarService();
