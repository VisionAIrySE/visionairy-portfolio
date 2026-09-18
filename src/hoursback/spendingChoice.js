// No default dollar amount: callers must carry an explicit user choice.
function spendingChoice(args, name) {
  if (args.includes('--no-spending-limit')) return Infinity;
  const flag = args.find((arg) => arg.startsWith(`--${name}=`));
  const value = flag ? Number(flag.slice(name.length + 3)) : NaN;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Choose an approved --${name}=amount or explicit --no-spending-limit before paid work.`);
  }
  return value;
}
module.exports = { spendingChoice };
