CREATE TYPE "public"."family_relation" AS ENUM('spouse', 'partner', 'parent', 'child', 'sibling', 'other');--> statement-breakpoint
CREATE TYPE "public"."reaction_target" AS ENUM('expense', 'deposit');--> statement-breakpoint
CREATE TYPE "public"."share_level" AS ENUM('totals', 'categories', 'transactions', 'receipts');--> statement-breakpoint
CREATE TABLE "connection" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"requester_id" text NOT NULL,
	"addressee_id" text NOT NULL,
	"relation" "family_relation" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "family_invite" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"inviter_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"relation" "family_relation" NOT NULL,
	"level" "share_level" NOT NULL,
	"email" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_invite_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "goal_deposit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_member" (
	"goal_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_member_goal_id_user_id_pk" PRIMARY KEY("goal_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reaction" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"target_kind" "reaction_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_grant" (
	"owner_id" text NOT NULL,
	"viewer_id" text NOT NULL,
	"level" "share_level" NOT NULL,
	"paused_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_grant_owner_id_viewer_id_pk" PRIMARY KEY("owner_id","viewer_id")
);
--> statement-breakpoint
CREATE TABLE "split" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"currency" char(3) NOT NULL,
	"data" jsonb NOT NULL,
	"paid" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"public_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "split_publicToken_unique" UNIQUE("public_token")
);
--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_addressee_id_user_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invite" ADD CONSTRAINT "family_invite_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invite" ADD CONSTRAINT "family_invite_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_deposit" ADD CONSTRAINT "goal_deposit_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_deposit" ADD CONSTRAINT "goal_deposit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_member" ADD CONSTRAINT "goal_member_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_member" ADD CONSTRAINT "goal_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_grant" ADD CONSTRAINT "share_grant_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_grant" ADD CONSTRAINT "share_grant_viewer_id_user_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split" ADD CONSTRAINT "split_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_active_pair_idx" ON "connection" USING btree (least("requester_id", "addressee_id"),greatest("requester_id", "addressee_id")) WHERE "connection"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "connection_addressee_idx" ON "connection" USING btree ("addressee_id");--> statement-breakpoint
CREATE INDEX "family_invite_inviter_idx" ON "family_invite" USING btree ("inviter_id","created_at");--> statement-breakpoint
CREATE INDEX "goal_deposit_goal_idx" ON "goal_deposit" USING btree ("goal_id","created_at");--> statement-breakpoint
CREATE INDEX "goal_member_user_idx" ON "goal_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reaction_once_idx" ON "reaction" USING btree ("user_id","target_kind","target_id");--> statement-breakpoint
CREATE INDEX "reaction_target_idx" ON "reaction" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "share_grant_viewer_idx" ON "share_grant" USING btree ("viewer_id");--> statement-breakpoint
CREATE INDEX "split_owner_idx" ON "split" USING btree ("owner_id","created_at");