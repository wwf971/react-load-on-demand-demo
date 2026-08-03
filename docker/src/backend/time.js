// Project time format: 20260520_23250530+09
// - two digits after seconds -> 10 ms precision
// - timezone precision is one hour

const pad2 = (n) => String(n).padStart(2, '0')

export const formatTime = (date = new Date()) => {
  const tzMinutes = -date.getTimezoneOffset()
  const tzHours = Math.trunc(tzMinutes / 60)
  const tzSign = tzHours < 0 ? '-' : '+'

  const yyyy = date.getFullYear()
  const mm = pad2(date.getMonth() + 1)
  const dd = pad2(date.getDate())
  const hh = pad2(date.getHours())
  const mi = pad2(date.getMinutes())
  const ss = pad2(date.getSeconds())
  const cs = pad2(Math.floor(date.getMilliseconds() / 10)) // centiseconds

  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}${cs}${tzSign}${pad2(Math.abs(tzHours))}`
}

export const timeNow = () => formatTime(new Date())
