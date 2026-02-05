export const isGroupChat = (chat) => chat?.type === "group" || chat?.type === "supergroup";

export const displayName = (user) => {
  if (!user) return "Невідомо";
  if (user.name && String(user.name).trim()) return String(user.name).trim();
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.username) return user.username;
  return "Користувач";
};

export const formatUserLine = (user) => {
  const name = displayName(user);
  return user.username ? `${name} (@${user.username})` : name;
};

export const pickRandomItem = (items, rng = Math.random) => {
  if (!items?.length) return null;
  const index = Math.floor(rng() * items.length);
  return items[index];
};

export const pickRandomUser = (users, rng = Math.random) => pickRandomItem(users, rng);

export const getRandomDonation = (min = 10, max = 100, rng = Math.random) => {
  const safeMin = Number.isFinite(min) ? Math.floor(min) : 10;
  const safeMax = Number.isFinite(max) ? Math.floor(max) : 100;
  const lower = Math.min(safeMin, safeMax);
  const upper = Math.max(safeMin, safeMax);
  return Math.floor(rng() * (upper - lower + 1)) + lower;
};

export const buildJarUrl = (jarUrl, amount) => {
  if (!jarUrl) return jarUrl;
  if (!jarUrl.includes("send.monobank.ua/jar")) {
    return jarUrl;
  }
  try {
    const url = new URL(jarUrl);
    url.searchParams.set("a", String(amount));
    return url.toString();
  } catch (error) {
    return jarUrl;
  }
};
