// Package email provides SMTP email delivery for team invitations,
// password resets, and compliance alert notifications.
//
// Environment variables:
//   SMTP_HOST     — SMTP server hostname (e.g. smtp.gmail.com)
//   SMTP_PORT     — port (587 STARTTLS, 465 SSL, 25 plain)
//   SMTP_USER     — authentication username
//   SMTP_PASSWORD — authentication password or app password
//   SMTP_TLS      — "true" to use STARTTLS (recommended)
//   SMTP_FROM     — sender, e.g. "Watchpost <noreply@company.com>"
//   FRONTEND_URL  — base URL for links in emails
package email

import (
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"os"
	"strconv"
	"strings"
)

// Config holds SMTP connection parameters.
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	UseTLS   bool
	From     string // may be "Display Name <addr@host>" or plain "addr@host"
}

// LoadConfig reads SMTP settings from env vars.
// Returns nil if SMTP_HOST is not set (email delivery disabled).
func LoadConfig() *Config {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		log.Println("SMTP_HOST not configured — email delivery disabled")
		return nil
	}
	port, _ := strconv.Atoi(os.Getenv("SMTP_PORT"))
	if port == 0 {
		port = 587
	}
	useTLS := strings.ToLower(os.Getenv("SMTP_TLS")) != "false"
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = "Watchpost <noreply@localhost>"
	}
	return &Config{
		Host:     host,
		Port:     port,
		User:     os.Getenv("SMTP_USER"),
		Password: os.Getenv("SMTP_PASSWORD"),
		UseTLS:   useTLS,
		From:     from,
	}
}

// Message is an outbound email.
type Message struct {
	To      []string
	Subject string
	Body    string // HTML
}

// extractEmail returns the bare email address from "Display Name <addr@host>" or "addr@host".
// Gmail's SMTP requires a plain address (no display name) in the MAIL FROM command.
func extractEmail(from string) string {
	if i := strings.Index(from, "<"); i >= 0 {
		if j := strings.Index(from[i:], ">"); j >= 0 {
			return strings.TrimSpace(from[i+1 : i+j])
		}
	}
	return strings.TrimSpace(from)
}

// Send delivers an email. Returns nil if SMTP is not configured.
func (c *Config) Send(msg Message) error {
	if c == nil || c.Host == "" {
		log.Printf("Email skipped (SMTP unconfigured): %q → %v", msg.Subject, msg.To)
		return nil
	}
	addr := fmt.Sprintf("%s:%d", c.Host, c.Port)
	smtpAuth := smtp.PlainAuth("", c.User, c.Password, c.Host)
	body := buildMIME(c.From, msg.To, msg.Subject, msg.Body)
	// smtp.Mail() and SendMail() require a bare email address, not "Name <addr>"
	bareFrom := extractEmail(c.From)
	var err error
	if c.UseTLS {
		err = sendSTARTTLS(addr, smtpAuth, c.Host, bareFrom, msg.To, body)
	} else {
		err = smtp.SendMail(addr, smtpAuth, bareFrom, msg.To, body)
	}
	if err != nil {
		log.Printf("Email send failed %q → %v: %v", msg.Subject, msg.To, err)
		return fmt.Errorf("smtp: %w", err)
	}
	log.Printf("Email sent OK: %q → %v", msg.Subject, msg.To)
	return nil
}

func sendSTARTTLS(addr string, auth smtp.Auth, host, from string, to []string, body []byte) error {
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("dial %s: %w", addr, err)
	}
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer c.Close()
	if err = c.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
		return fmt.Errorf("starttls: %w", err)
	}
	if auth != nil {
		if err = c.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err = c.Mail(from); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	for _, r := range to {
		if err = c.Rcpt(r); err != nil {
			return fmt.Errorf("smtp RCPT TO %s: %w", r, err)
		}
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err = w.Write(body); err != nil {
		return err
	}
	return w.Close()
}

func buildMIME(from string, to []string, subject, html string) []byte {
	var b strings.Builder
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	b.WriteString(fmt.Sprintf("From: %s\r\n", from))
	b.WriteString(fmt.Sprintf("To: %s\r\n", strings.Join(to, ", ")))
	b.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	b.WriteString("\r\n")
	b.WriteString(html)
	return []byte(b.String())
}

var frontendURL = func() string {
	if u := os.Getenv("FRONTEND_URL"); u != "" {
		return u
	}
	return "http://localhost:3000"
}()

// watchpostLogo is a small inline SVG of the Watchpost W/watchtower mark.
const watchpostLogo = `<svg width="48" height="48" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 12px">
  <circle cx="32" cy="32" r="32" fill="rgba(0,0,0,0.25)"/>
  <rect x="9" y="14" width="8" height="3" rx="1" fill="white"/>
  <rect x="47" y="14" width="8" height="3" rx="1" fill="white"/>
  <rect x="28" y="14" width="8" height="3" rx="1" fill="white"/>
  <rect x="10" y="17" width="6" height="22" rx="1" fill="white"/>
  <rect x="48" y="17" width="6" height="22" rx="1" fill="white"/>
  <polygon points="16,17 22,17 32,39 26,39" fill="white"/>
  <polygon points="48,17 42,17 32,39 38,39" fill="white"/>
  <circle cx="32" cy="12" r="3" fill="white"/>
  <rect x="8" y="40" width="48" height="2" rx="1" fill="rgba(255,255,255,0.6)"/>
</svg>`

// emailHeader returns the branded header HTML used in all emails.
func emailHeader(accentColor string) string {
	return fmt.Sprintf(`
  <tr>
    <td style="background:linear-gradient(135deg,%s 0%%,#3D5AFE 100%%);padding:32px;text-align:center">
      %s
      <h1 style="color:white;margin:0;font-size:22px;font-weight:800;letter-spacing:4px">WATCHPOST</h1>
      <p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:10px;letter-spacing:2px">DEVICE FLEET MANAGEMENT</p>
    </td>
  </tr>`, accentColor, watchpostLogo)
}

// emailWrapper wraps content in a consistent email shell.
func emailWrapper(headerAccent, bodyHTML string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Watchpost</title></head>
<body style="margin:0;padding:0;background:#0b0e14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:40px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0"
  style="background:#0f1117;border-radius:16px;border:1px solid #2a2d3a;overflow:hidden;max-width:560px;width:100%%">
  %s
  %s
  <tr>
    <td style="padding:20px 32px;border-top:1px solid #2a2d3a;text-align:center">
      <p style="color:#424242;font-size:11px;margin:0">
        © Watchpost — Device Fleet Management. This is an automated message, please do not reply.
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`, emailHeader(headerAccent), bodyHTML)
}

// SendTeamInvitation emails a new user their credentials and a login link.
func (c *Config) SendTeamInvitation(toEmail, inviterEmail, orgName, tempPassword string) error {
	bodyRows := fmt.Sprintf(`
  <tr><td style="padding:32px">
    <h2 style="color:#ffffff;margin:0 0 8px;font-size:20px;font-weight:700">You've been invited 🎉</h2>
    <p style="color:#9e9e9e;margin:0 0 24px;font-size:14px;line-height:1.6">
      <strong style="color:#ffffff">%s</strong> has invited you to join
      <strong style="color:#00BCD4">%s</strong> on Watchpost.
    </p>
    <table width="100%%" cellpadding="0" cellspacing="0"
      style="background:#1a1d27;border:1px solid #2a2d3a;border-radius:10px;margin-bottom:24px">
      <tr><td style="padding:16px 20px;border-bottom:1px solid #2a2d3a">
        <p style="color:#616161;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 6px;text-transform:uppercase">Login Email</p>
        <code style="color:#00BCD4;font-size:15px;font-family:monospace">%s</code>
      </td></tr>
      <tr><td style="padding:16px 20px">
        <p style="color:#616161;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 6px;text-transform:uppercase">Temporary Password</p>
        <code style="color:#00BCD4;font-size:15px;font-family:monospace">%s</code>
      </td></tr>
    </table>
    <p style="color:#9e9e9e;font-size:13px;margin:0 0 28px;padding:12px 16px;background:#1a1d27;border-left:3px solid #FFA726;border-radius:4px">
      ⚠️ Change your password immediately after first login.
    </p>
    <table cellpadding="0" cellspacing="0"><tr><td>
      <a href="%s/login"
        style="display:inline-block;background:linear-gradient(135deg,#00BCD4,#3D5AFE);color:white;text-decoration:none;
               padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:0.5px">
        Sign in to Watchpost →
      </a>
    </td></tr></table>
    <p style="color:#424242;font-size:12px;margin:24px 0 0;line-height:1.5">
      This invitation was sent by <strong style="color:#9e9e9e">%s</strong>.
      If you were not expecting this, you can safely ignore this email.
    </p>
  </td></tr>`,
		inviterEmail, orgName, toEmail, tempPassword, frontendURL, inviterEmail)

	return c.Send(Message{
		To:      []string{toEmail},
		Subject: fmt.Sprintf("You're invited to join %s on Watchpost", orgName),
		Body:    emailWrapper("#00BCD4", bodyRows),
	})
}

// SendPasswordReset emails a password reset link (expires in 1 hour).
func (c *Config) SendPasswordReset(toEmail, resetToken string) error {
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", frontendURL, resetToken)
	bodyRows := fmt.Sprintf(`
  <tr><td style="padding:32px">
    <h2 style="color:#ffffff;margin:0 0 8px;font-size:20px;font-weight:700">Password Reset Request</h2>
    <p style="color:#9e9e9e;margin:0 0 24px;font-size:14px;line-height:1.6">
      We received a password reset request for <strong style="color:#ffffff">%s</strong>.
      This link expires in <strong style="color:#00BCD4">1 hour</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td>
      <a href="%s"
        style="display:inline-block;background:linear-gradient(135deg,#3D5AFE,#00BCD4);color:white;text-decoration:none;
               padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px">
        Reset My Password →
      </a>
    </td></tr></table>
    <p style="color:#424242;font-size:12px;margin:0;padding:12px 16px;background:#1a1d27;border-radius:6px;line-height:1.5">
      🔒 If you did not request a password reset, please ignore this email.
      Your password will not change unless you click the link above.
    </p>
  </td></tr>`, toEmail, resetURL)

	return c.Send(Message{
		To:      []string{toEmail},
		Subject: "Watchpost — Password Reset Request",
		Body:    emailWrapper("#3D5AFE", bodyRows),
	})
}

// SendComplianceAlert notifies admins of a compliance violation.
func (c *Config) SendComplianceAlert(to []string, serial, policyName, errMsg string) error {
	bodyRows := fmt.Sprintf(`
  <tr><td style="padding:32px">
    <h2 style="color:#EF5350;margin:0 0 8px;font-size:20px;font-weight:700">⚠️ Compliance Violation Detected</h2>
    <p style="color:#9e9e9e;margin:0 0 20px;font-size:14px;line-height:1.6">
      A device in your fleet has reported a compliance violation that requires your attention.
    </p>
    <table width="100%%" cellpadding="0" cellspacing="0"
      style="background:#1a1d27;border:1px solid #2a2d3a;border-radius:10px;margin-bottom:24px">
      <tr><td style="padding:14px 20px;border-bottom:1px solid #2a2d3a">
        <p style="color:#616161;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 4px;text-transform:uppercase">Device Serial</p>
        <strong style="color:#00BCD4;font-family:monospace;font-size:14px">%s</strong>
      </td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #2a2d3a">
        <p style="color:#616161;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 4px;text-transform:uppercase">Policy</p>
        <strong style="color:#ffffff;font-size:14px">%s</strong>
      </td></tr>
      <tr><td style="padding:14px 20px">
        <p style="color:#616161;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 4px;text-transform:uppercase">Error</p>
        <span style="color:#EF5350;font-size:13px">%s</span>
      </td></tr>
    </table>
    <table cellpadding="0" cellspacing="0"><tr><td>
      <a href="%s/devices"
        style="display:inline-block;background:#EF5350;color:white;text-decoration:none;
               padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px">
        View Device →
      </a>
    </td></tr></table>
  </td></tr>`, serial, policyName, errMsg, frontendURL)

	return c.Send(Message{
		To:      to,
		Subject: fmt.Sprintf("⚠️ Compliance Violation — Device %s — Watchpost", serial),
		Body:    emailWrapper("#EF5350", bodyRows),
	})
}
