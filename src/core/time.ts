// Calendar: 7-day weeks, 4 weeks/month, 12 months/year (336 days). Day 0 = Y1, March, W1.
export const DAYS_PER_WEEK = 7
export const WEEKS_PER_MONTH = 4
export const DAYS_PER_MONTH = 28
export const DAYS_PER_YEAR = 336
export const START_MONTH = 2 // March (0-based)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** absolute month index since Y1 January */
const absMonth = (day: number) => START_MONTH + Math.floor(day / DAYS_PER_MONTH)
export const monthOf = (day: number) => absMonth(day) % 12
export const yearOf = (day: number) => 1 + Math.floor(absMonth(day) / 12)
export const weekOfMonth = (day: number) => 1 + Math.floor((day % DAYS_PER_MONTH) / DAYS_PER_WEEK)
export const weekIndex = (day: number) => Math.floor(day / DAYS_PER_WEEK)
export const isWeekStart = (day: number) => day % DAYS_PER_WEEK === 0
export const isMonthStart = (day: number) => day % DAYS_PER_MONTH === 0
export const monthName = (m: number, long = false) => (long ? MONTHS_LONG : MONTHS)[((m % 12) + 12) % 12]
/** "Y1 · Mar · W2" */
export const formatDate = (day: number) => `Y${yearOf(day)} · ${monthName(monthOf(day))} · W${weekOfMonth(day)}`
export const formatDateLong = (day: number) => `Year ${yearOf(day)}, ${monthName(monthOf(day), true)}, week ${weekOfMonth(day)}`
/** first day of a given (year, month0, week1-4) */
export const dayOf = (year: number, month0: number, week = 1) => ((year - 1) * 12 + month0 - START_MONTH) * DAYS_PER_MONTH + (week - 1) * DAYS_PER_WEEK
/** BFCM = last week of November */
export const isBfcm = (day: number) => monthOf(day) === 10 && weekOfMonth(day) === 4
