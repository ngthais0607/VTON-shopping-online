const apparelOrder = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL", "XXXXXL"];
const numericOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function apparelRank(size: string) {
  const label = size.trim().toUpperCase().replace(/^([2-5])X([SL])$/, (_, count, end) => "X".repeat(Number(count)) + end);
  return apparelOrder.indexOf(label);
}

export function compareSizeLabels(a: string, b: string) {
  const left = apparelRank(a);
  const right = apparelRank(b);
  if (left >= 0 && right >= 0) return left - right;
  if (left >= 0 || right >= 0) return left >= 0 ? -1 : 1;
  return numericOrder.compare(a, b);
}
