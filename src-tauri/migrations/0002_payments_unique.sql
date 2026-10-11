CREATE UNIQUE INDEX idx_payments_sub_due ON payments(subscription_id, due_date);
