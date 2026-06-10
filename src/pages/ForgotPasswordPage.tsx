import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Form, Input, Button, Alert, Typography, Result } from 'antd';
import { ThunderboltFilled, MailOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { apiForgotPassword } from '../api/client';

const { Text } = Typography;

export default function ForgotPasswordPage() {
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [error, setError]       = useState<string | null>(null);

  const handleSubmit = async (values: { email: string }) => {
    setLoading(true);
    setError(null);
    try {
      await apiForgotPassword(values.email);
      setSentEmail(values.email);
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0d1e 0%, #13112b 60%, #1a1535 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(99,102,241,0.5)', marginBottom: 14,
          }}>
            <ThunderboltFilled style={{ color: '#fff', fontSize: 24 }} />
          </div>
          <div>
            <Text style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 24, letterSpacing: '-0.5px', display: 'block', lineHeight: 1.2 }}>
              Minerva
            </Text>
            <Text style={{ color: '#475569', fontSize: 12, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Decision Engine
            </Text>
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '36px 32px',
          backdropFilter: 'blur(12px)',
        }}>
          {sent ? (
            /* ── Success state ── */
            <Result
              icon={<div style={{ fontSize: 40 }}>📬</div>}
              title={<span style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700 }}>Check your inbox</span>}
              subTitle={
                <span style={{ color: '#64748b', fontSize: 13 }}>
                  We sent a password reset link to <strong style={{ color: '#a5b4fc' }}>{sentEmail}</strong>.
                  The link expires in 15 minutes.
                </span>
              }
              extra={
                <Link to="/login">
                  <Button
                    icon={<ArrowLeftOutlined />}
                    style={{
                      borderRadius: 8, fontWeight: 600, fontSize: 13,
                      background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)',
                      color: '#e2e8f0',
                    }}
                  >
                    Back to sign in
                  </Button>
                </Link>
              }
              style={{ padding: 0 }}
            />
          ) : (
            /* ── Form state ── */
            <>
              <Text style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 20, display: 'block', marginBottom: 6 }}>
                Forgot your password?
              </Text>
              <Text style={{ color: '#64748b', fontSize: 13, display: 'block', marginBottom: 28 }}>
                Enter your email and we'll send you a reset link.
              </Text>

              {error && (
                <Alert type="error" message={error} showIcon closable
                  onClose={() => setError(null)} style={{ marginBottom: 20, borderRadius: 8 }} />
              )}

              <Form layout="vertical" onFinish={handleSubmit} requiredMark={false} size="large">
                <Form.Item
                  name="email"
                  rules={[
                    { required: true, message: 'Email is required' },
                    { type: 'email', message: 'Enter a valid email' },
                  ]}
                >
                  <Input
                    prefix={<MailOutlined style={{ color: '#475569' }} />}
                    placeholder="Your account email"
                    style={{ borderRadius: 8, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#f1f5f9' }}
                  />
                </Form.Item>

                <Form.Item style={{ marginBottom: 0 }}>
                  <Button
                    type="primary" htmlType="submit" loading={loading} block
                    style={{
                      borderRadius: 8, height: 44, fontWeight: 600, fontSize: 14,
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      border: 'none', boxShadow: '0 2px 12px rgba(99,102,241,0.4)',
                    }}
                  >
                    Send reset link
                  </Button>
                </Form.Item>
              </Form>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link to="/login" style={{ color: '#475569', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <ArrowLeftOutlined style={{ fontSize: 11 }} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
