import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Form, Input, Button, Alert, Typography, Result } from 'antd';
import { ThunderboltFilled, LockOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { apiResetPassword } from '../api/client';

const { Text } = Typography;

export default function ResetPasswordPage() {
  const navigate           = useNavigate();
  const [searchParams]     = useSearchParams();
  const token              = searchParams.get('token') ?? '';

  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // If no token in URL show an error immediately
  useEffect(() => {
    if (!token) setError('Missing or invalid reset link. Please request a new one.');
  }, [token]);

  const handleSubmit = async (values: { newPassword: string }) => {
    setLoading(true);
    setError(null);
    try {
      await apiResetPassword(token, values.newPassword);
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reset failed');
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
          {done ? (
            /* ── Success state ── */
            <Result
              icon={<div style={{ fontSize: 40 }}>✅</div>}
              title={<span style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700 }}>Password updated!</span>}
              subTitle={
                <span style={{ color: '#64748b', fontSize: 13 }}>
                  Your password has been reset successfully. You can now sign in with your new password.
                </span>
              }
              extra={
                <Button
                  type="primary"
                  onClick={() => navigate('/login', { replace: true })}
                  style={{
                    borderRadius: 8, fontWeight: 600,
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    border: 'none',
                  }}
                >
                  Sign in
                </Button>
              }
              style={{ padding: 0 }}
            />
          ) : (
            /* ── Form state ── */
            <>
              <Text style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 20, display: 'block', marginBottom: 6 }}>
                Set a new password
              </Text>
              <Text style={{ color: '#64748b', fontSize: 13, display: 'block', marginBottom: 28 }}>
                Choose a strong password for your account.
              </Text>

              {error && (
                <Alert type="error" message={error} showIcon
                  style={{ marginBottom: 20, borderRadius: 8 }} />
              )}

              <Form layout="vertical" onFinish={handleSubmit} requiredMark={false} size="large">
                <Form.Item
                  name="newPassword"
                  rules={[
                    { required: true, message: 'Password is required' },
                    { min: 8, message: 'Password must be at least 8 characters' },
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#475569' }} />}
                    placeholder="New password (min. 8 characters)"
                    style={{ borderRadius: 8, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#f1f5f9' }}
                  />
                </Form.Item>

                <Form.Item
                  name="confirm"
                  dependencies={['newPassword']}
                  rules={[
                    { required: true, message: 'Please confirm your password' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                        return Promise.reject(new Error('Passwords do not match'));
                      },
                    }),
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#475569' }} />}
                    placeholder="Confirm new password"
                    style={{ borderRadius: 8, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#f1f5f9' }}
                  />
                </Form.Item>

                <Form.Item style={{ marginBottom: 0 }}>
                  <Button
                    type="primary" htmlType="submit"
                    loading={loading} disabled={!token} block
                    style={{
                      borderRadius: 8, height: 44, fontWeight: 600, fontSize: 14,
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      border: 'none', boxShadow: '0 2px 12px rgba(99,102,241,0.4)',
                    }}
                  >
                    Reset password
                  </Button>
                </Form.Item>
              </Form>
            </>
          )}
        </div>

        {!done && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Link to="/login" style={{ color: '#475569', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <ArrowLeftOutlined style={{ fontSize: 11 }} /> Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
