// Package email provides SMTP email delivery for team invitations,
// password resets, and compliance alert notifications.
//
// Environment variables:
//   SMTP_HOST     — SMTP server hostname (e.g. smtp.gmail.com)
//   SMTP_PORT     — port (587 STARTTLS, 465 SSL, 25 plain)
//   SMTP_USER     — authentication username
//   SMTP_PASSWORD — authentication password or app password
//   SMTP_TLS      — "true" to use STARTTLS (recommended)
//   SMTP_FROM     — sender, e.g. "OpenMDM <noreply@company.com>"
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
	From     string
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
		from = "OpenMDM <noreply@localhost>"
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

// Send delivers an email. Returns nil if SMTP is not configured.
func (c *Config) Send(msg Message) error {
	if c == nil || c.Host == "" {
		log.Printf("Email skipped (SMTP unconfigured): %q → %v", msg.Subject, msg.To)
		return nil
	}
	addr := fmt.Sprintf("%s:%d", c.Host, c.Port)
	auth := smtp.PlainAuth("", c.User, c.Password, c.Host)
	body := buildMIME(c.From, msg.To, msg.Subject, msg.Body)
	var err error
	if c.UseTLS {
		err = sendSTARTTLS(addr, auth, c.Host, c.From, msg.To, body)
	} else {
		err = smtp.SendMail(addr, auth, c.From, msg.To, body)
	}
	if err != nil {
		log.Printf("Email send failed %q → %v: %v", msg.Subject, msg.To, err)
		return fmt.Errorf("smtp: %w", err)
	}
	log.Printf("Email sent: %q → %v", msg.Subject, msg.To)
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
			return fmt.Errorf("auth: %w", err)
		}
	}
	if err = c.Mail(from); err != nil {
		return err
	}
	for _, r := range to {
		if err = c.Rcpt(r); err != nil {
			return err
		}
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	_, err = w.Write(body)
	if err != nil {
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

// SendTeamInvitation emails a new user their temporary password and a login link.
func (c *Config) SendTeamInvitation(toEmail, inviterEmail, orgName, tempPassword string) error {
	body := fmt.Sprintf(`<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto">
<div style="background:#0f1117;padding:32px;border-radius:12px;border:1px solid #2a2d3a">
<h2 style="color:#00BCD4;margin-top:0">🛡️ Welcome to %s</h2>
<p><strong>%s</strong> has invited you to join <strong>%s</strong>.</p>
<div style="background:#1a1d27;border-radius:8px;padding:16px;margin:16px 0;font-family:monospace">
<div>Email: <strong style="color:#00BCD4">%s</strong></div>
<div style="margin-top:8px">Temp Password: <strong style="color:#00BCD4">%s</strong></div>
</div>
<p>Change your password after first login.</p>
<a href="%s/login" style="background:#00BCD4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Log In →</a>
</div></body></html>`, orgName, inviterEmail, orgName, toEmail, tempPassword, frontendURL)
	return c.Send(Message{To: []string{toEmail},
		Subject: fmt.Sprintf("You've been invited to %s — OpenMDM", orgName), Body: body})
}

// SendPasswordReset emails a password reset link (expires in 1 hour).
func (c *Config) SendPasswordReset(toEmail, resetToken string) error {
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", frontendURL, resetToken)
	body := fmt.Sprintf(`<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto">
<div style="background:#0f1117;padding:32px;border-radius:12px;border:1px solid #2a2d3a">
<h2 style="color:#00BCD4;margin-top:0">🛡️ Password Reset</h2>
<p>Reset request for <strong>%s</strong>. Link expires in 1 hour.</p>
<a href="%s" style="background:#3D5AFE;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Reset Password →</a>
<p style="font-size:12px;color:#616161;margin-top:16px">Ignore if you did not request this.</p>
</div></body></html>`, toEmail, resetURL)
	return c.Send(Message{To: []string{toEmail}, Subject: "OpenMDM — Password Reset", Body: body})
}

// SendComplianceAlert notifies admins of a compliance violation.
func (c *Config) SendComplianceAlert(to []string, serial, policy, errMsg string) error {
	body := fmt.Sprintf(`<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto">
<div style="background:#0f1117;padding:32px;border-radius:12px;border:1px solid #2a2d3a">
<h2 style="color:#EF5350;margin-top:0">⚠️ Compliance Violation</h2>
<div style="background:#1a1d27;border-radius:8px;padding:16px;margin:16px 0">
<div>Device: <strong style="color:#00BCD4">%s</strong></div>
<div style="margin-top:8px">Policy: <strong>%s</strong></div>
<div style="margin-top:8px;color:#EF5350">%s</div>
</div>
<a href="%s/devices" style="background:#EF5350;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Device →</a>
</div></body></html>`, serial, policy, errMsg, frontendURL)
	return c.Send(Message{To: to, Subject: fmt.Sprintf("⚠️ Compliance Violation — %s", serial), Body: body})
}
