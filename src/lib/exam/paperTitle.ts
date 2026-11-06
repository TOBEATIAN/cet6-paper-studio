/** CET-6 default title: year/month/day + paper name. */
export function createCet6PaperTitle(date = new Date()): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日六级模拟卷`;
}

export function isCet6TimestampTitle(title: string): boolean {
  return /^\d{4}年\d{1,2}月\d{1,2}日六级模拟卷$/.test(
    title.trim(),
  );
}
