/**
 * Meta Lead Outreach Automation
 *
 * Flow:
 * Meta Lead Ads -> language-specific Raw tabs -> Master Leads -> Gmail outreach
 *
 * Sanitized reference implementation.
 */

const CONFIG = {
  BRAND_NAME: 'Your Brand',
  MASTER_SHEET: 'Master Leads',
  SOURCES: [
    { sheet: 'English Raw', language: 'English' },
    { sheet: 'French Raw', language: 'French' },
    { sheet: 'Japanese Raw', language: 'Japanese' },
    { sheet: 'Korean Raw', language: 'Korean' },
    { sheet: 'Arabic Raw', language: 'Arabic' }
  ],
  MAX_EMAILS_PER_RUN: 10
};

function syncMetaLeadsToMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const master = ss.getSheetByName(CONFIG.MASTER_SHEET);

  if (!master) throw new Error(`Missing sheet: ${CONFIG.MASTER_SHEET}`);

  const masterLastRow = master.getLastRow();
  const masterData =
    masterLastRow > 1
      ? master.getRange(2, 1, masterLastRow - 1, 15).getDisplayValues()
      : [];

  const existingLeadIds = new Set();
  const existingEmails = new Set();

  masterData.forEach(row => {
    const leadId = normalizeLeadId(row[0]);
    const email = normalizeEmail(row[3]);
    if (leadId) existingLeadIds.add(leadId);
    if (email) existingEmails.add(email);
  });

  const rowsToAdd = [];

  CONFIG.SOURCES.forEach(source => {
    const sheet = ss.getSheetByName(source.sheet);
    if (!sheet || sheet.getLastRow() < 2) return;

    const data = sheet.getDataRange().getDisplayValues();
    const headers = buildHeaderIndex(data[0]);

    for (let r = 1; r < data.length; r++) {
      const row = data[r];

      const leadId = normalizeLeadId(getField(row, headers, ['id']));
      const email = normalizeEmail(getField(row, headers, ['email']));
      const fullName = String(
        getField(row, headers, ['full_name', 'full name', 'name']) || ''
      ).trim();

      if (!leadId && !email) continue;

      if (
        email.endsWith('@meta.com') ||
        fullName.toLowerCase().includes('test lead')
      ) continue;

      if (
        (leadId && existingLeadIds.has(leadId)) ||
        (email && existingEmails.has(email))
      ) continue;

      const createdTime = getField(row, headers, ['created_time', 'created time']);
      const campaign = getField(row, headers, ['campaign_name', 'campaign name']);
      const adSet = getField(row, headers, ['adset_name', 'ad set name', 'adset name']);
      const formName = getField(row, headers, ['form_name', 'form name']);
      const platform = getField(row, headers, ['platform']);
      const businessName = getField(row, headers, [
        'business_name', 'business name',
        'company_name', 'company name',
        'store_name', 'store name'
      ]);

      rowsToAdd.push([
        leadId,
        createdTime || '',
        fullName,
        email,
        businessName || '',
        source.language,
        campaign || '',
        adSet || '',
        formName || '',
        'NO',
        '',
        'NO',
        '',
        'New',
        platform ? `Meta platform: ${platform}` : ''
      ]);

      if (leadId) existingLeadIds.add(leadId);
      if (email) existingEmails.add(email);
    }
  });

  if (rowsToAdd.length > 0) {
    const startRow = master.getLastRow() + 1;
    master.getRange(startRow, 1, rowsToAdd.length, 1).setNumberFormat('@');
    master.getRange(startRow, 1, rowsToAdd.length, 15).setValues(rowsToAdd);
  }

  console.log(`Added ${rowsToAdd.length} new lead(s).`);
}

function sendRetailLeadEmails() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.MASTER_SHEET);

  if (!sheet) throw new Error(`Missing sheet: ${CONFIG.MASTER_SHEET}`);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('Another email run is already in progress.');
    return;
  }

  try {
    const data = sheet.getDataRange().getDisplayValues();
    if (data.length < 2) {
      console.log('No leads found.');
      return;
    }

    const headers = buildHeaderIndex(data[0]);

    ['full name', 'email', 'language', 'email sent', 'email sent at']
      .forEach(header => {
        if (headers[header] === undefined) {
          throw new Error(`Missing column: ${header}`);
        }
      });

    const alreadySent = new Set();

    for (let r = 1; r < data.length; r++) {
      const email = normalizeEmail(data[r][headers['email']]);
      const sent = String(data[r][headers['email sent']] || '')
        .trim()
        .toUpperCase();

      if (email && sent === 'YES') alreadySent.add(email);
    }

    let sentCount = 0;

    for (let r = data.length - 1; r >= 1; r--) {
      if (sentCount >= CONFIG.MAX_EMAILS_PER_RUN) break;

      const row = data[r];
      const fullName = String(row[headers['full name']] || '').trim();
      const email = normalizeEmail(row[headers['email']]);
      const language = String(row[headers['language']] || '').trim();
      const emailSent = String(row[headers['email sent']] || '')
        .trim()
        .toUpperCase();

      if (!email) continue;
      if (emailSent !== 'NO') continue;
      if (email.endsWith('@meta.com')) continue;
      if (alreadySent.has(email)) continue;

      const template = getRetailEmailTemplate(language, fullName);
      if (!template) {
        console.log(`Skipped ${email}: unsupported language "${language}"`);
        continue;
      }

      try {
        GmailApp.sendEmail(
          email,
          template.subject,
          template.body,
          { name: CONFIG.BRAND_NAME }
        );

        sheet.getRange(r + 1, headers['email sent'] + 1).setValue('YES');
        sheet.getRange(r + 1, headers['email sent at'] + 1).setValue(new Date());

        alreadySent.add(email);
        sentCount++;
        console.log(`Sent to ${email} (${language})`);
      } catch (error) {
        console.error(`Failed sending to ${email}: ${error.message}`);
      }
    }

    console.log(`Sent ${sentCount} email(s).`);
  } finally {
    lock.releaseLock();
  }
}

function getRetailEmailTemplate(language, fullName) {
  const name = fullName || '';

  const templates = {
    English: {
      subject: `${CONFIG.BRAND_NAME} Retail Partnership`,
      body:
`Hi ${name},

Thank you for your recent interest in becoming a ${CONFIG.BRAND_NAME} retail partner.

We'd love to learn a little more about your business. Could you please share your store website or Instagram page and the country/city where you are located?

Once received, our team will be happy to provide further information regarding our retail partnership opportunities.

Best,
${CONFIG.BRAND_NAME}`
    },

    French: {
      subject: `Partenariat commercial avec ${CONFIG.BRAND_NAME}`,
      body:
`Bonjour ${name},

Merci de votre récent intérêt pour devenir partenaire revendeur ${CONFIG.BRAND_NAME}.

Nous aimerions en savoir un peu plus sur votre entreprise. Pourriez-vous nous communiquer le site web ou le compte Instagram de votre boutique, ainsi que le pays et la ville où vous êtes situé(e) ?

Dès réception de ces informations, notre équipe se fera un plaisir de vous fournir plus de détails sur nos opportunités de partenariat.

Cordialement,
${CONFIG.BRAND_NAME}`
    },

    Japanese: {
      subject: `${CONFIG.BRAND_NAME} リテールパートナーシップ`,
      body:
`${name} 様

${CONFIG.BRAND_NAME}のリテールパートナーシップにご関心をお寄せいただき、ありがとうございます。

貴社についてもう少し詳しくお伺いできれば幸いです。店舗のウェブサイトまたはInstagramアカウント、および所在する国と都市をお知らせいただけますでしょうか。

確認後、弊社チームよりリテールパートナーシップの詳細をご案内いたします。

どうぞよろしくお願いいたします。
${CONFIG.BRAND_NAME}`
    },

    Korean: {
      subject: `${CONFIG.BRAND_NAME} 리테일 파트너십`,
      body:
`안녕하세요 ${name}님,

${CONFIG.BRAND_NAME} 리테일 파트너십에 관심을 가져주셔서 감사합니다.

귀사의 비즈니스에 대해 조금 더 알고 싶습니다. 매장 웹사이트 또는 Instagram 계정과 매장이 위치한 국가 및 도시를 공유해 주실 수 있을까요?

정보를 확인한 후, 저희 팀에서 리테일 파트너십에 대한 자세한 내용을 안내해 드리겠습니다.

감사합니다.
${CONFIG.BRAND_NAME}`
    },

    Arabic: {
      subject: `شراكة التجزئة مع ${CONFIG.BRAND_NAME}`,
      body:
`مرحبًا ${name}،

شكرًا لاهتمامك الأخير بأن تصبح شريكًا لـ ${CONFIG.BRAND_NAME} في قطاع التجزئة.

نود معرفة المزيد عن نشاطك التجاري. هل يمكنك مشاركة موقع متجرك الإلكتروني أو حساب Instagram، بالإضافة إلى البلد والمدينة التي يقع فيها متجرك؟

بعد استلام هذه المعلومات، سيسعد فريقنا بتزويدك بمزيد من التفاصيل حول فرص الشراكة معنا.

مع أطيب التحيات،
${CONFIG.BRAND_NAME}`
    }
  };

  return templates[language] || null;
}

function testAutomatedRetailEmail() {
  const recipient = 'your-test-email@example.com';
  const template = getRetailEmailTemplate('English', 'Test');

  GmailApp.sendEmail(
    recipient,
    template.subject,
    template.body,
    { name: CONFIG.BRAND_NAME }
  );

  console.log(`Test email sent to ${recipient}`);
}

function buildHeaderIndex(headers) {
  const index = {};
  headers.forEach((header, i) => {
    index[String(header || '').trim().toLowerCase()] = i;
  });
  return index;
}

function getField(row, headerIndex, candidateHeaders) {
  for (const header of candidateHeaders) {
    const key = String(header).trim().toLowerCase();
    const idx = headerIndex[key];
    if (idx !== undefined) return row[idx];
  }
  return '';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeLeadId(id) {
  return String(id || '').replace(/\D/g, '').trim();
}
