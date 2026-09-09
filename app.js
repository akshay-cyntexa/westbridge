/**
 * Westbridge University — public course-interest site.
 * Talks to guest REST endpoint for Westbridge programs & admissions interest.
 */
// The path segment before /services/ is the hosting Force.com Site's UrlPathPrefix. The ChargeOn
// site in this org has NO prefix, so there is none here — a stale '/vforcesite' 301-redirects into
// /studentportalvforcesite/... and the call dies on the redirect. Check the prefix per org:
//   SELECT Name, UrlPathPrefix FROM Site
const API_BASE_URL = 'https://fun-app-67652-dev-ed.scratch.my.site.com/services/apexrest/Chgon/v1/courseInterest';

const catalogEl = document.getElementById('course-catalog');
const formEl = document.getElementById('interest-form');
const programSelectEl = document.getElementById('program-select');
const statusEl = document.getElementById('form-status');
const referralInputEl = document.getElementById('referral-code');
const referralBannerEl = document.getElementById('referral-banner');
const referralBannerCodeEl = document.getElementById('referral-banner-code');

const REFERRAL_STORAGE_KEY = 'wbu_referral_code';
const REFERRAL_MAX_LENGTH = 12;

// Same patterns as force-app/main/default/lwc/paymentFormScreen/paymentFormScreen.html
// (customer_email / customer_phone inputs) — kept identical so validation is consistent
// across ChargeOn's payment form and this public site.
const EMAIL_PATTERN = /^[a-zA-Z0-9_\-+]+([.][a-zA-Z0-9_\-+]+)*@[a-zA-Z0-9\-]+([.][a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}$/;
const PHONE_PATTERN = /^[+]?[0-9]{8,15}$/;

const emailInputEl = document.getElementById('email');
const phoneInputEl = document.getElementById('phone');

// Mirror of WestbridgeCourseInterestSiteAPI.normalizeReferralCode — uppercase, alnum only, trimmed to 12.
function normalizeReferralCode(raw) {
    if (!raw) return '';
    const cleaned = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return cleaned.slice(0, REFERRAL_MAX_LENGTH);
}

function readStoredReferralCode() {
    try {
        return normalizeReferralCode(window.localStorage.getItem(REFERRAL_STORAGE_KEY));
    } catch (err) {
        return '';
    }
}

function storeReferralCode(code) {
    try {
        window.localStorage.setItem(REFERRAL_STORAGE_KEY, code);
    } catch (err) {
        /* storage blocked (private mode) — the form field still carries the code for this visit */
    }
}

// Reads ?ref= (or ?referral=) from the URL, remembers it across pages, and prefills the form.
function initReferralCapture() {
    if (!referralInputEl) return;

    const params = new URLSearchParams(window.location.search);
    const fromUrl = normalizeReferralCode(params.get('ref') || params.get('referral'));
    if (fromUrl) {
        storeReferralCode(fromUrl);
    }

    const code = fromUrl || readStoredReferralCode();
    if (!code) return;

    referralInputEl.value = code;
    if (referralBannerEl && referralBannerCodeEl) {
        referralBannerCodeEl.textContent = code;
        referralBannerEl.hidden = false;
    }
}

// Helper to format program fees
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '';
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount);
}

// Fetch and render programs list from Salesforce REST API
async function loadPrograms() {
    catalogEl.innerHTML = '<p class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading courses…</p>';
    try {
        const response = await fetch(`${API_BASE_URL}/programs`, { method: 'GET' });
        if (!response.ok) {
            throw new Error('Unable to load courses right now.');
        }
        const programs = await response.json();
        renderCatalog(programs);
        renderProgramOptions(programs);
    } catch (err) {
        catalogEl.innerHTML = `<p class="error">${err.message}</p>`;
    }
}

// Render dynamic course cards into the grid
function renderCatalog(programs) {
    if (!programs || !programs.length) {
        catalogEl.innerHTML = '<p>No courses are currently open for interest.</p>';
        return;
    }
    catalogEl.innerHTML = programs
        .map(
            (p) => `
        <article class="course-card">
            <div>
                <h3>${p.name}</h3>
                <p class="course-type">${p.programType || 'Degree Program'}</p>
            </div>
            <ul>
                ${p.durationMonths ? `<li><i class="fa-regular fa-clock"></i> <strong>Duration:</strong> ${p.durationMonths} months</li>` : ''}
                ${p.frequency ? `<li><i class="fa-regular fa-calendar-check"></i> <strong>Pacing:</strong> ${p.frequency}</li>` : ''}
                ${p.totalFee ? `<li><i class="fa-solid fa-tag"></i> <strong>Tuition:</strong> ${formatCurrency(p.totalFee)}</li>` : ''}
            </ul>
        </article>`
        )
        .join('');
}

// Populate interest form select dropdown
function renderProgramOptions(programs) {
    if (!programSelectEl) return;
    programSelectEl.innerHTML =
        '<option value="">Select a course (optional)</option>' +
        programs.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
}

// form.reset() wipes the prefilled code — put the remembered one back.
function restoreReferralCodeAfterReset() {
    if (!referralInputEl) return;
    const code = readStoredReferralCode();
    if (code) referralInputEl.value = code;
}

// Called once the referral has actually been used (a successful submission) so it
// doesn't keep auto-applying itself to every future visit/submission from this browser.
function clearStoredReferralCode() {
    try {
        window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
    } catch (err) {
        /* storage blocked (private mode) — nothing to clear */
    }
    if (referralInputEl) referralInputEl.value = '';
    if (referralBannerEl) referralBannerEl.hidden = true;
}

// Live-sanitizes the Phone field, mirroring paymentFormScreen.js's phoneInputChange —
// strips everything except digits, keeping a single leading '+', so invalid characters
// never even appear. The `pattern` on the input still validates on submit as a backstop.
function phoneInputChange(event) {
    const raw = event.target.value || '';
    const hasLeadingPlus = raw.trimStart().startsWith('+');
    const digits = raw.replace(/[^0-9]/g, '');
    const cleaned = (hasLeadingPlus ? '+' : '') + digits;

    if (raw !== cleaned) {
        event.target.value = cleaned;
    }
}

// Handle Interest Form submission
async function submitInterest(event) {
    event.preventDefault();
    statusEl.textContent = '';
    statusEl.className = '';

    const email = emailInputEl.value.trim();
    const phone = phoneInputEl.value.trim();

    if (!EMAIL_PATTERN.test(email)) {
        statusEl.textContent = 'Please enter a valid email address.';
        statusEl.className = 'error';
        emailInputEl.focus();
        return;
    }

    if (phone && !PHONE_PATTERN.test(phone)) {
        statusEl.textContent = 'Please enter a valid phone number (8-15 digits).';
        statusEl.className = 'error';
        phoneInputEl.focus();
        return;
    }

    const payload = {
        firstName: document.getElementById('first-name').value.trim(),
        lastName: document.getElementById('last-name').value.trim(),
        email,
        phone,
        programId: programSelectEl.value || null,
        message: document.getElementById('message').value.trim()
    };

    const referralCode = referralInputEl ? normalizeReferralCode(referralInputEl.value) : '';
    if (referralCode) {
        payload.referralCode = referralCode;
    }

    const submitButton = formEl.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

    try {
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        statusEl.textContent = result.message || 'Thank you! Your interest has been registered.';
        statusEl.className = result.success !== false ? 'success' : 'error';
        if (result.success !== false) {
            formEl.reset();
            clearStoredReferralCode();
        }
    } catch (err) {
        statusEl.textContent = 'We could not submit your interest. Please try again.';
        statusEl.className = 'error';
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Submit Interest <i class="fa-solid fa-paper-plane"></i>';
    }
}

// Hero Banner Slider functionality
function initHeroSlider() {
    const slides = document.querySelectorAll('.hero-slider .slide');
    const prevBtn = document.getElementById('prev-slide');
    const nextBtn = document.getElementById('next-slide');
    if (!slides.length) return;

    let currentSlide = 0;

    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === index);
        });
    }

    function nextSlide() {
        currentSlide = (currentSlide + 1) % slides.length;
        showSlide(currentSlide);
    }

    function prevSlide() {
        currentSlide = (currentSlide - 1 + slides.length) % slides.length;
        showSlide(currentSlide);
    }

    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);

    // Auto rotate every 6 seconds
    setInterval(nextSlide, 6000);
}

// Mobile Menu Navigation Toggle
function initMobileMenu() {
    const toggleBtn = document.getElementById('mobile-toggle');
    const navMenu = document.getElementById('nav-menu');
    if (toggleBtn && navMenu) {
        toggleBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
}

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    if (formEl) {
        formEl.addEventListener('submit', submitInterest);
    }
    if (phoneInputEl) {
        phoneInputEl.addEventListener('input', phoneInputChange);
    }
    initReferralCapture();
    initHeroSlider();
    initMobileMenu();
    loadPrograms();
});
