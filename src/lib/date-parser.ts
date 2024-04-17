import { parse, format } from 'date-fns';

export function parseAndFormatDate(dateStr: string, currentFormat: string, desiredFormat: string): string {
  const parsedDate = parse(dateStr, currentFormat, new Date());
  return format(parsedDate, desiredFormat);
}