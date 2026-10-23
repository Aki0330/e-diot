CREATE TABLE "users" (
	"user_id" varchar(64) PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"phone_num" varchar(20),
	"email" varchar(255),
	"password_hash" varchar(255) NOT NULL,
	"monthly_budget" numeric(12, 2) DEFAULT '0',
	"currency" varchar(10) DEFAULT 'CNY',
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_phone_num_key" UNIQUE("phone_num"),
	CONSTRAINT "users_email_key" UNIQUE("email"),
	CONSTRAINT "check_phone_or_email" CHECK ((phone_num IS NOT NULL AND email IS NULL) OR (phone_num IS NULL AND email IS NOT NULL) OR (phone_num IS NOT NULL AND email IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"transaction_id" bigserial PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"type" varchar(10),
	"category" varchar(50) NOT NULL,
	"sub_category" varchar(50),
	"merchant" varchar(100),
	"note" text,
	"raw_text" text,
	"transaction_time" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "transactions_type_check" CHECK (type IN ('EXPENSE', 'INCOME'))
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"budget_id" bigserial PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"category" varchar(50) NOT NULL,
	"monthly_limit" numeric(12, 2) NOT NULL,
	"year_month" varchar(7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "budgets_user_id_category_year_month_key" UNIQUE("user_id","category","year_month")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"message_id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"intent_type" varchar(30),
	"graph_path" varchar(300),
	"execution_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"session_id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"title" varchar(200) DEFAULT '新对话' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_phone" ON "users" USING btree ("phone_num") WHERE phone_num IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email") WHERE email IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_transactions_user_time" ON "transactions" USING btree ("user_id","transaction_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_transactions_category" ON "transactions" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "idx_messages_session_time" ON "chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_chat_messages_session_id" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ix_chat_sessions_user_id" ON "chat_sessions" USING btree ("user_id");