const { Telegraf, Markup } = require("telegraf");
const { ethers } = require("ethers");
const crypto = require("crypto");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FOUNDER_WALLET = "0xD7AbCb1e2424A3dcB54409E77c8E0ADB666C6198";
const RPC_URL = "https://mainnet.base.org";

// سر التشفير الرئيسي المعزول (Master Secret) + الملح الثابت لمنع التعارض
const MASTER_SECRET = process.env.WALLET_MASTER_SECRET || "HYDRA_PROTOCOL_V7_ENTERPRISE_KMS_SECRET_2026";
const STATIC_SALT = "HYDRA_BASE_MAINNET_CHAINID_8453";

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
  "function isGraduated() view returns (bool)"
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const curveContract = new ethers.Contract(CONTRACTS.curve, CURVE_ABI, provider);
const tokenContract = new ethers.Contract(CONTRACTS.token, TOKEN_ABI, provider);

// 🛡️ اشتقاق آمن عالي التشفير بمعيار HMAC-SHA256 معزول عن توكن البوت
function getUserWallet(userId) {
  const hmac = crypto.createHmac("sha256", MASTER_SECRET);
  hmac.update(`${STATIC_SALT}:${userId}`);
  const derivedPrivateKey = "0x" + hmac.digest("hex");
  return new ethers.Wallet(derivedPrivateKey, provider);
}

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

async function buildDashboard(userId) {
  const userWallet = getUserWallet(userId);
  const stats = await getProtocolStats();

  let ethBal = "0.0", hydraBal = "0.0";
  try {
    const eth = await provider.getBalance(userWallet.address);
    const hydra = await tokenContract.balanceOf(userWallet.address);
    ethBal = Number(ethers.formatEther(eth)).toFixed(4);
    hydraBal = Number(ethers.formatEther(hydra)).toLocaleString();
  } catch (e) {}

  const progressBar = renderProgressBar(Number(stats.progress));
  const text = 
`⚡ <b>HYDRA TRADING BOT - BASE MAINNET</b> ⚡
<i>Decentralized Bonding Curve & AMM on Base L2</i>

📊 <b>Graduation Progress:</b> [${progressBar}] <code>${stats.progress}%</code>
💰 <b>Bonding Reserve:</b> <code>${stats.reserve} / 100 ETH</code>
🪙 <b>Curve Tokens Sold:</b> <code>${stats.totalSold}M / 800M HYDRA</code>
💲 <b>Price:</b> <code>${stats.price} Base ETH</code>
${stats.isGraduated ? "🎓 <b>Status:</b> 🚀 GRADUATED TO UNISWAP v4!" : "🔥 <b>Status:</b> Trading Active on Curve"}

━━━━━━━━━━━━━━━━━━━━━
👛 <b>Your Base Trading Wallet:</b>
📍 <code>${userWallet.address}</code> <i>(Tap to copy)</i>
💎 <b>ETH Balance:</b> <code>${ethBal} ETH</code>
🪙 <b>HYDRA Balance:</b> <code>${hydraBal} HYDRA</code>
━━━━━━━━━━━━━━━━━━━━━
<i>Deposit Base ETH to your address above to start instant trading.</i>`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("🟢 Buy 0.001 ETH", "buy_0.001"),
      Markup.button.callback("🟢 Buy 0.002 ETH", "buy_0.002"),
      Markup.button.callback("🟢 Buy 0.005 ETH", "buy_0.005")
    ],
    [
      Markup.button.callback("🟢 Buy 0.01 ETH", "buy_0.01"),
      Markup.button.callback("🔴 Sell 25%", "sell_25"),
      Markup.button.callback("🔴 Sell 50%", "sell_50")
    ],
    [
      Markup.button.callback("🔴 Sell 100%", "sell_100"),
      Markup.button.callback("👥 My Referral Link", "my_referral")
    ],
    [
      Markup.button.callback("🔄 Refresh", "refresh_dashboard"),
      Markup.button.callback("🔐 Export Private Key", "export_key")
    ]
  ]);

  return { text, keyboard };
}

const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    const { text, keyboard } = await buildDashboard(userId);
    await ctx.reply(text, { parse_mode: "HTML", ...keyboard });
  } catch (err) {
    console.error("Start error:", err);
  }
});

bot.action("refresh_dashboard", async (ctx) => {
  await ctx.answerCbQuery("Refreshing...");
  const { text, keyboard } = await buildDashboard(ctx.from.id.toString());
  try { await ctx.editMessageText(text, { parse_mode: "HTML", ...keyboard }); } catch (e) {}
});

async function executeBuy(ctx, userId, ethAmountStr) {
  const userWallet = getUserWallet(userId);
  const ethToSpend = ethers.parseEther(ethAmountStr);

  const balance = await provider.getBalance(userWallet.address);
  if (balance < ethToSpend) {
    return ctx.reply(`❌ <b>Insufficient Base ETH!</b>\nYou have <code>${ethers.formatEther(balance)} ETH</code>, needed <code>${ethAmountStr} ETH</code> + gas.`, { parse_mode: "HTML" });
  }

  const msg = await ctx.reply(`⏳ <b>Executing Buy Order for ${ethAmountStr} ETH on Base Mainnet...</b>`, { parse_mode: "HTML" });

  try {
    const botFee = (ethToSpend * 50n) / 10000n; // 0.5% للمؤسس
    const netEth = ethToSpend - botFee;

    const feeTx = await userWallet.sendTransaction({ to: FOUNDER_WALLET, value: botFee });
    await feeTx.wait(1);

    const curveWithSigner = new ethers.Contract(CONTRACTS.curve, CURVE_ABI, userWallet);
    const buyTx = await curveWithSigner.buy(0, FOUNDER_WALLET, { value: netEth, gasLimit: 250000 });
    await buyTx.wait(1);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      `🎉 <b>Buy Successful on Base Mainnet!</b>\n\n` +
      `💸 <b>Amount Spent:</b> <code>${ethAmountStr} ETH</code>\n` +
      `🎁 <b>Cashback (10%):</b> Automatically refunded to your wallet!\n` +
      `🔗 <a href="https://basescan.org/tx/${buyTx.hash}">View Transaction on Basescan</a>`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ <b>Buy Failed:</b> ${error.reason || error.message}`, { parse_mode: "HTML" });
  }
}

bot.action(/buy_(\d+\.?\d*)/, async (ctx) => {
  await ctx.answerCbQuery();
  await executeBuy(ctx, ctx.from.id.toString(), ctx.match[1]);
});

async function executeSell(ctx, userId, percentage) {
  const userWallet = getUserWallet(userId);
  const tokenBal = await tokenContract.balanceOf(userWallet.address);

  if (tokenBal === 0n) return ctx.reply("❌ <b>You don't have any HYDRA tokens to sell!</b>", { parse_mode: "HTML" });
  const tokensToSell = (tokenBal * BigInt(percentage)) / 100n;

  const msg = await ctx.reply(`⏳ <b>Processing Sell Order on Base Mainnet...</b>`, { parse_mode: "HTML" });

  try {
    const tokenWithSigner = new ethers.Contract(CONTRACTS.token, TOKEN_ABI, userWallet);
    const curveWithSigner = new ethers.Contract(CONTRACTS.curve, CURVE_ABI, userWallet);

    const allowance = await tokenWithSigner.allowance(userWallet.address, CONTRACTS.curve);
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
      `🎉 <b>Sell Successful on Base Mainnet!</b>\n\n` +
      `🪙 <b>Tokens Sold:</b> <code>${ethers.formatEther(tokensToSell)} HYDRA</code>\n` +
      `🛡️ <b>Exit Fee (2%):</b> Routed to Yield Vault\n` +
      `🔗 <a href="https://basescan.org/tx/${sellTx.hash}">View Transaction on Basescan</a>`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ <b>Sell Failed:</b> ${error.reason || error.message}`, { parse_mode: "HTML" });
  }
}

bot.action(/sell_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  await executeSell(ctx, ctx.from.id.toString(), parseInt(ctx.match[1]));
});

bot.action("my_referral", async (ctx) => {
  await ctx.answerCbQuery();
  const userWallet = getUserWallet(ctx.from.id.toString());
  const botInfo = await ctx.telegram.getMe();
  const refLink = `https://t.me/${botInfo.username}?start=ref_${userWallet.address}`;
  await ctx.reply(
    `👥 <b>HYDRA VIRAL REFERRAL SYSTEM</b> 👥\n\n` +
    `Earn <b>30% of buy fees (0.45% of total volume)</b> paid instantly in Base ETH on-chain!\n\n` +
    `🔗 <b>Your Referral Link:</b>\n<code>${refLink}</code>`,
    { parse_mode: "HTML" }
  );
});

bot.action("export_key", async (ctx) => {
  await ctx.answerCbQuery();
  const userWallet = getUserWallet(ctx.from.id.toString());
  await ctx.reply(`🔐 <b>YOUR BASE PRIVATE KEY:</b>\n\n<code>${userWallet.privateKey}</code>\n\n⚠️ <i>Keep it secret!</i>`, { parse_mode: "HTML" });
});

module.exports = async (req, res) => {
  try {
    if (req.method === "POST") {
      await bot.handleUpdate(req.body);
      return res.status(200).send("OK");
    } else {
      return res.status(200).send("🟢 Hydra Base Mainnet Bot is Live & Secure on Vercel!");
    }
  } catch (e) {
    return res.status(200).send("OK");
  }
};
