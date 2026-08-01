/**
 * Jewish Kids Hub — custom password reset email
 * ------------------------------------------------
 * Replaces Firebase's built-in "reset password" email with one sent through
 * your own SMTP account (e.g. Gmail), using your own subject/body wording,
 * while still using Firebase Auth to generate the actual secure reset link.
 *
 * SETUP (one-time):
 *   1. Make sure your Firebase project is on the Blaze (pay-as-you-go) plan.
 *      Cloud Functions that make outbound network calls (like sending email)
 *      require Blaze — the free Spark plan can't do this.
 *   2. In this "functions" folder, run:  npm install
 *   3. Set your SMTP credentials as environment config (see .env.example below).
 *      If you're using Gmail: turn on 2-Step Verification on jewishkidshub@gmail.com,
 *      then create an "App Password" (myaccount.google.com/apppasswords) —
 *      use that App Password here, NOT your normal Gmail password.
 *   4. Deploy:  firebase deploy --only functions
 *
 * After deploying, update login.html to call this function instead of
 * Firebase's built-in sendPasswordResetEmail (see the note at the bottom
 * of this file for the exact client-side change).
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const {getAuth} = require('firebase-admin/auth');
const nodemailer = require('nodemailer');

admin.initializeApp();

// These are set via `firebase functions:secrets:set SMTP_USER` etc. (see README below)
const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_PORT = defineSecret('SMTP_PORT');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');

// Where the reset link should send people — must be an Authorized Domain in Firebase Auth settings.
const RESET_PAGE_URL = 'https://jewishkidshub.com/reset-password.html';

exports.sendCustomPasswordReset = onCall(
  {secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS]},
  async (request) => {
    const email = request.data && request.data.email;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new HttpsError('invalid-argument', 'A valid email address is required.');
    }

    const actionCodeSettings = {
      url: RESET_PAGE_URL,
      handleCodeInApp: true,
    };

    let link;
    try {
      link = await getAuth().generatePasswordResetLink(email, actionCodeSettings);
    } catch (err) {
      // Don't reveal whether the email exists on the account — respond as if it
      // succeeded either way. This matches Firebase's own default behavior and
      // avoids letting someone probe which emails have accounts.
      console.error('generatePasswordResetLink error:', err.message);
      return {success: true};
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST.value(),
      port: Number(SMTP_PORT.value() || 587),
      secure: Number(SMTP_PORT.value()) === 465,
      auth: {
        user: SMTP_USER.value(),
        pass: SMTP_PASS.value(),
      },
    });

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif; max-width:480px; margin:0 auto; padding:28px; color:#32261B;">
        <h2 style="color:#F9681F; font-size:22px; margin-bottom:4px;">Reset your password</h2>
        <p>Hi,</p>
        <p>We received a request to reset the password for your Jewish Kids Hub account (${email}).</p>
        <p style="margin:26px 0;">
          <a href="${link}" style="background:#FF9900; color:#ffffff; padding:13px 28px; border-radius:999px; text-decoration:none; font-weight:bold; display:inline-block;">Reset Password</a>
        </p>
        <p style="font-size:13px; color:#6B5744;">Or copy and paste this link into your browser:<br>${link}</p>
        <p>If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
        <p>For your security, this link will expire soon.</p>
        <p>Warmly,<br>The Jewish Kids Hub Team</p>
      </div>`;

    try {
      await transporter.sendMail({
        from: `"Jewish Kids Hub" <${SMTP_USER.value()}>`,
        to: email,
        subject: 'Reset your password for Jewish Kids Hub',
        html,
      });
    } catch (err) {
      console.error('sendMail error:', err.message);
      throw new HttpsError('internal', 'Could not send the email right now — please try again in a moment.');
    }

    return {success: true};
  }
);

/**
 * CLIENT-SIDE CHANGE NEEDED IN login.html:
 * -----------------------------------------
 * 1. Add this script tag alongside the other firebase-*-compat.js tags:
 *      <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-functions-compat.js"></script>
 *
 * 2. Replace the forgot-password submit handler's body with:
 *
 *   document.getElementById('authForgotForm').addEventListener('submit', e => {
 *     e.preventDefault();
 *     const em = document.getElementById('fEmail').value;
 *     const sendReset = firebase.functions().httpsCallable('sendCustomPasswordReset');
 *     sendReset({ email: em })
 *       .then(() => { toast('Password reset link sent!'); switchAuthView('signin'); })
 *       .catch(err => document.getElementById('authError').textContent = err.message);
 *   });
 *
 * That's it — everything else on the site (the reset-password.html landing page,
 * the confirmPasswordReset logic) stays exactly the same, since the link this
 * function generates works the same way as Firebase's own.
 */
