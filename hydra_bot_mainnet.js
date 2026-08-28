const { Telegraf, Markup } = require("telegraf");
const { ethers } = require("ethers");
const express = require("express");
const fs = require("fs");
const path = require("path");

// تشغيل خادم ويب صغير لمنع السيرفر من النوم
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("🟢 Hydra Base Mainnet Bot is Live 24/7!"));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FOUNDER_WALLET = "0xD7AbCb1e2424A3dcB54409E77c8E0ADB666C6198";
const RPC_URL = "https://mainnet.base.org";

const CONTRACTS = {
  token: "0x287092EB206cC3bFee7af1a184cf3619AF0E871f",
  curve: "0x32c3d28eE73e693d4281Ad27015d7a5A8Aa103A2",
  vault: "0xbbCF7C332DAA130e47D5110e0A7E38fD7F4a1745",
  hook: "0x9dA529BCA5e288935b62F80925ee0311FFA67472",
  migrator: "0x32D8808c0869d85B84Ca76c57812c87c2a7A3274"
};

const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

const CURVE_ABI = [
  "function buy(uint256 minTokensOut, address referrer) payable returns (uint256)",
  "function sell(uint256 tokenAmount, uint256 minEthOut) returns (uint256)",
  "function totalTokensSold() view returns (uint256)",
  "function curveEthReserve() view returns (uint256)",
  "function getCurrentPrice() view returns (uint256)",
  "function isGraduated() view returns (bool)",
  "function graduationPrepared() view returns (bool)",
  "function prepareGraduation(address migrator) external"
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const curveContract = new ethers.Contract(CONTRACTS.curve, CURVE_ABI, provider);
const tokenContract = new ethers.Contract(CONTRACTS.token, TOKEN_ABI, provider);

const DB_FILE = path.join(__dirname, "bot_users.json");
let usersDb = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : {};
function saveDb() { fs.writeFileSync(DB_FILE, JSON.stringify(usersDb, null, 2)); }
const userSessions = {};

function renderProgressBar(percentage, length = 10) {
  const p = Math.min(100, Math.max(0, percentage));
  const filled = Math.round((p / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

async function getProtocolStats() {
  try {
    const totalSold = await curveContract.totalTokensSold();
    const ethReserve = await curveContract.curveEthReserve();
    const currentPrice = await curveContract.getCurrentPrice();
    const isGraduated = await curveContract.isGraduated();

    const progressEth = (Number(ethReserve) / Number(ethers.parseEther("100"))) * 100;
    return {
      totalSold: (Number(ethers.formatEther(totalSold)) / 1_000_000).toFixed(2),
      reserve: Number(ethers.formatEther(ethReserve)).toFixed(4),
      price: ethers.formatEther(currentPrice),
      progress: progressEth.toFixed(1),
      isGraduated
    };
  } catch (e) {
    return { totalSold: "0", reserve: "0", price: "0", progress: "0", isGraduated: false };
  }
}

function getOrCreateUser(userId, referrer = null) {
  if (!usersDb[userId]) {
    const wallet = ethers.Wallet.createRandom();
    usersDb[userId] = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      referrer: referrer || FOUNDER_WALLET,
      createdAt: new Date().toISOString()
    };
    saveDb();
  }
  return usersDb[userId];
}

async function buildDashboard(userId) {
  const user = getOrCreateUser(userId);
  const stats = await getProtocolStats();

  let ethBal = "0.0", hydraBal = "0.0";
  try {
    const eth = await provider.getBalance(user.address);
    const hydra = await tokenContract.balanceOf(user.address);
    ethBal = Number(ethers.formatEther(eth)).toFixed(4);
    hydraBal = Number(ethers.formatEther(hydra)).toLocaleString();
  } catch (e) {}

  const progressBar = renderProgressBar(Number(stats.progress));
  const text = 
`⚡ *HYDRA TRADING BOT - BASE MAINNET* ⚡
_Decentralized Bonding Curve & AMM on Base L2_

📊 *Graduation Progress:* [${progressBar}] \`${stats.progress}%\`
💰 *Bonding Reserve:* \`${stats.reserve} / 100 ETH\`
🪙 *Curve Tokens Sold:* \`${stats.totalSold}M / 800M HYDRA\`
💲 *Price:* \`${stats.price} Base ETH\`
${stats.isGraduated ? "🎓 *Status:* 🚀 GRADUATED TO UNISWAP v4!" : "🔥 *Status:* Trading Active on Curve"}

━━━━━━━━━━━━━━━━━━━━━
👛 *Your Base Trading Wallet:*
📍 \`${user.address}\` _(Tap to copy)_
💎 *ETH Balance:* \`${ethBal} ETH\`
🪙 *HYDRA Balance:* \`${hydraBal} HYDRA\`
━━━━━━━━━━━━━━━━━━━━━
_Deposit Base ETH to your address above to start instant trading._`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("🟢 Buy 0.002 ETH", "buy_0.002"),
      Markup.button.callback("🟢 Buy 0.005 ETH", "buy_0.005"),
      Markup.button.callback("🟢 Buy 0.01 ETH", "buy_0.01")
    ],
    [
      Markup.button.callback("🟢 Custom Buy", "buy_custom"),
      Markup.button.callback("🔴 Sell 25%", "sell_25"),
      Markup.button.callback("🔴 Sell 50%", "sell_50")
    ],
    [
      Markup.button.callback("🔴 Sell 100%", "sell_100"),
      Markup.button.callback("🔴 Custom Sell", "sell_custom")
    ],
    [
      Markup.button.callback("👥 My Referral Link", "my_referral"),
      Markup.button.callback("🔄 Refresh", "refresh_dashboard")
    ],
    [
      Markup.button.callback("🔐 Export Private Key", "export_key"),
      Markup.button.callback("💸 Withdraw ETH", "withdraw_eth")
    ]
  ]);

  return { text, keyboard };
}

const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const payload = ctx.startPayload;
  let referrer = FOUNDER_WALLET;
  if (payload && payload.startsWith("ref_")) {
    const refAddr = payload.replace("ref_", "");
    if (ethers.isAddress(refAddr)) referrer = refAddr;
  }
  getOrCreateUser(userId, referrer);
  const { text, keyboard } = await buildDashboard(userId);
  await ctx.replyWithMarkdown(text, keyboard);
});

bot.action("refresh_dashboard", async (ctx) => {
  await ctx.answerCbQuery("Refreshing...");
  const { text, keyboard } = await buildDashboard(ctx.from.id.toString());
  try { await ctx.editMessageText(text, { parse_mode: "Markdown", ...keyboard }); } catch (e) {}
});

async function executeBuy(ctx, userId, ethAmountStr) {
  const user = usersDb[userId];
  const userWallet = new ethers.Wallet(user.privateKey, provider);
  const ethToSpend = ethers.parseEther(ethAmountStr);

  const balance = await provider.getBalance(user.address);
  if (balance < ethToSpend) {
    return ctx.reply(`❌ *Insufficient Base ETH!*\nYou have \`${ethers.formatEther(balance)} ETH\`, needed \`${ethAmountStr} ETH\` + gas.`, { parse_mode: "Markdown" });
  }

  const msg = await ctx.reply(`⏳ *Executing Buy Order for ${ethAmountStr} ETH on Base Mainnet...*`, { parse_mode: "Markdown" });

  try {
    const botFee = (ethToSpend * 50n) / 10000n; // 0.5% للمؤسس
    const netEth = ethToSpend - botFee;

    const feeTx = await userWallet.sendTransaction({ to: FOUNDER_WALLET, value: botFee });
    await feeTx.wait(1);

    const curveWithSigner = new ethers.Contract(CONTRACTS.curve, CURVE_ABI, userWallet);
    const referrer = user.referrer || FOUNDER_WALLET;

    const buyTx = await curveWithSigner.buy(0, referrer, { value: netEth, gasLimit: 250000 });
    await buyTx.wait(1);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      `🎉 *Buy Successful on Base Mainnet!*\n\n` +
      `💸 *Amount Spent:* \`${ethAmountStr} ETH\`\n` +
      `🎁 *Cashback (10%):* Automatically refunded to your wallet!\n` +
      `🔗 *Basescan:* [View Transaction](https://basescan.org/tx/${buyTx.hash})`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ *Buy Failed:* ${error.reason || error.message}`, { parse_mode: "Markdown" });
  }
}

bot.action(/buy_(\d+\.?\d*)/, async (ctx) => {
  await ctx.answerCbQuery();
  await executeBuy(ctx, ctx.from.id.toString(), ctx.match[1]);
});

bot.action("buy_custom", async (ctx) => {
  await ctx.answerCbQuery();
  userSessions[ctx.from.id.toString()] = { state: "AWAITING_BUY_AMOUNT" };
  await ctx.reply("💬 *Enter the amount of Base ETH you want to buy:* (e.g., `0.005`)", { parse_mode: "Markdown" });
});

async function executeSell(ctx, userId, percentage) {
  const user = usersDb[userId];
  const userWallet = new ethers.Wallet(user.privateKey, provider);
  const tokenBal = await tokenContract.balanceOf(user.address);

  if (tokenBal === 0n) return ctx.reply("❌ *You don\'t have any HYDRA tokens to sell!*", { parse_mode: "Markdown" });
  const tokensToSell = (tokenBal * BigInt(percentage)) / 100n;

  const msg = await ctx.reply(`⏳ *Processing Sell Order on Base Mainnet...*`, { parse_mode: "Markdown" });

  try {
    const tokenWithSigner = new ethers.Contract(CONTRACTS.token, TOKEN_ABI, userWallet);
    const curveWithSigner = new ethers.Contract(CONTRACTS.curve, CURVE_ABI, userWallet);

    const allowance = await tokenWithSigner.allowance(user.address, CONTRACTS.curve);
    if (allowance < tokensToSell) {
      const atx = await tokenWithSigner.approve(CONTRACTS.curve, ethers.MaxUint256);
      await atx.wait(1);
    }

    const sellTx = await curveWithSigner.sell(tokensToSell, 0, { gasLimit: 250000 });
    await sellTx.wait(1);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      `🎉 *Sell Successful on Base Mainnet!*\n\n` +
      `🪙 *Tokens Sold:* \`${ethers.formatEther(tokensToSell)} HYDRA\`\n` +
      `🛡️ *Exit Fee (2%):* Routed to Yield Vault\n` +
      `🔗 *Basescan:* [View Transaction](https://basescan.org/tx/${sellTx.hash})`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ *Sell Failed:* ${error.reason || error.message}`, { parse_mode: "Markdown" });
  }
}

bot.action(/sell_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  await executeSell(ctx, ctx.from.id.toString(), parseInt(ctx.match[1]));
});

bot.action("sell_custom", async (ctx) => {
  await ctx.answerCbQuery();
  userSessions[ctx.from.id.toString()] = { state: "AWAITING_SELL_AMOUNT" };
  await ctx.reply("💬 *Enter exact amount of HYDRA tokens to sell:*", { parse_mode: "Markdown" });
});

bot.action("my_referral", async (ctx) => {
  await ctx.answerCbQuery();
  const user = getOrCreateUser(ctx.from.id.toString());
  const botInfo = await ctx.telegram.getMe();
  const refLink = `https://t.me/${botInfo.username}?start=ref_${user.address}`;
  await ctx.replyWithMarkdown(
    `👥 *HYDRA VIRAL REFERRAL SYSTEM* 👥\n\n` +
    `Earn *30% of buy fees (0.45% of total volume)* paid instantly in Base ETH on-chain!\n\n` +
    `🔗 *Your Referral Link:*\n\`${refLink}\``
  );
});

bot.action("export_key", async (ctx) => {
  await ctx.answerCbQuery();
  const user = getOrCreateUser(ctx.from.id.toString());
  await ctx.reply(`🔐 *YOUR BASE PRIVATE KEY:*\n\n\`${user.privateKey}\`\n\n⚠️ *Keep it secret!*`, { parse_mode: "Markdown" });
});

bot.action("withdraw_eth", async (ctx) => {
  await ctx.answerCbQuery();
  userSessions[ctx.from.id.toString()] = { state: "AWAITING_WITHDRAW_ADDRESS" };
  await ctx.reply("💬 *Enter destination Base address to withdraw all your ETH:*", { parse_mode: "Markdown" });
});

bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return;
  const text = ctx.message.text.trim();

  if (session.state === "AWAITING_BUY_AMOUNT") {
    delete userSessions[userId];
    if (isNaN(text) || parseFloat(text) <= 0) return ctx.reply("❌ Invalid amount.");
    await executeBuy(ctx, userId, text);
  } else if (session.state === "AWAITING_SELL_AMOUNT") {
    delete userSessions[userId];
    if (isNaN(text) || parseFloat(text) <= 0) return ctx.reply("❌ Invalid amount.");
    const user = usersDb[userId];
    const userWallet = new ethers.Wallet(user.privateKey, provider);
    const tokensToSell = ethers.parseEther(text);
    try {
      const tokenWithSigner = new ethers.Contract(CONTRACTS.token, TOKEN_ABI, userWallet);
      const curveWithSigner = new ethers.Contract(CONTRACTS.curve, CURVE_ABI, userWallet);
      const allowance = await tokenWithSigner.allowance(user.address, CONTRACTS.curve);
      if (allowance < tokensToSell) await (await tokenWithSigner.approve(CONTRACTS.curve, ethers.MaxUint256)).wait(1);
      const stx = await (await curveWithSigner.sell(tokensToSell, 0)).wait(1);
      ctx.reply(`🎉 Sold ${text} HYDRA successfully!\nBasescan: https://basescan.org/tx/${stx.hash}`);
    } catch (e) { ctx.reply(`❌ Sell error: ${e.message}`); }
  } else if (session.state === "AWAITING_WITHDRAW_ADDRESS") {
    if (!ethers.isAddress(text)) return ctx.reply("❌ Invalid address.");
    delete userSessions[userId];
    const user = usersDb[userId];
    const userWallet = new ethers.Wallet(user.privateKey, provider);
    const bal = await provider.getBalance(user.address);
    const gasBuffer = ethers.parseEther("0.0001");
    if (bal <= gasBuffer) return ctx.reply("❌ Insufficient balance for gas.");
    const withdrawAmount = bal - gasBuffer;
    try {
      const tx = await (await userWallet.sendTransaction({ to: text, value: withdrawAmount })).wait(1);
      ctx.reply(`💸 *Withdrawal Successful!*\nSent \`${ethers.formatEther(withdrawAmount)} ETH\`\nBasescan: https://basescan.org/tx/${tx.hash}`, { parse_mode: "Markdown" });
    } catch (e) { ctx.reply(`❌ Failed: ${e.message}`); }
  }
});

bot.launch().then(() => {
  console.log("🚀 HYDRA BOT IS ONLINE!");
});
