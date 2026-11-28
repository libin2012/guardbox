# Cloud sync setup

GuardBox keeps everything on your phone unless you turn on sync. Each provider below uses **your own** free-tier project, so your data never touches a server you don't control. Credentials are saved in the iOS Keychain on the device, never inside backups.

Sync stores one backup document per user, **end-to-end encrypted** on the phone with an encryption passphrase you choose in Backup & sync (use the same one on every device). The provider only ever stores ciphertext. When both the phone and the cloud changed since the last sync, GuardBox asks which copy to keep.

## Google Drive

Used for **Back Up Now / Restore from Google Drive** and for Google Drive **sync**. Free, and you only set it up once per app build.

1. Go to console.cloud.google.com and create a project (or pick one).
2. **APIs & Services > Library**: enable the **Google Drive API**.
3. **APIs & Services > OAuth consent screen** (Google Auth Platform): app name *GuardBox*, your email as support and developer contact. Under **Data access** add the scope `.../auth/drive.file` (non-sensitive, so no Google review is needed). While the app is in *Testing*, add your Google account under **Audience > Test users**. Note: in Testing mode Google expires the sign-in after 7 days; publish the app (no review needed for this scope) to avoid that.
4. **Clients > Create client > iOS**: bundle ID = the app's bundle ID (`com.guardbox.app` unless you set `IOS_BUNDLE_ID`). Copy the **Client ID** (`1234-abc.apps.googleusercontent.com`).
5. Build with it:
   ```bash
   GOOGLE_IOS_CLIENT_ID=1234-abc.apps.googleusercontent.com npx expo prebuild --clean
   GOOGLE_IOS_CLIENT_ID=1234-abc.apps.googleusercontent.com npx expo run:ios --device
   ```
   `app.config.ts` registers the reversed client ID as a URL scheme so Google can return to the app. The client ID is not a secret (iOS clients have none).
6. In GuardBox: Settings > Backup & sync > **Connect Google Drive**.

Files go into a **GuardBox** folder in your Drive: `GuardBox-backup-<date>-<time>.json` for each backup, and `GuardBox-sync.json` if you sync through Drive. All are encrypted with your passphrase. GuardBox can only see files it created, so moving them out of the folder or renaming them is fine, but deleting the folder starts a new one.

## iCloud

Needs a paid Apple Developer account. Build with `ENABLE_ICLOUD=1` (see README). The container defaults to `iCloud.<bundle id>`; override with `ICLOUD_CONTAINER=iCloud.your.container`. In the Apple Developer portal, enable iCloud (CloudKit/iCloud Documents) for the App ID and create the container if Xcode does not do it automatically.

## Firebase

1. Create a project at console.firebase.google.com.
2. **Authentication** > Sign-in method > enable **Email/Password**.
3. **Firestore Database** > Create database (production mode), then set these **Rules**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/guardbox/{doc} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
4. Project settings > General: copy the **Web API key** and **Project ID**.
5. In GuardBox: Settings > Backup & sync > Firebase, fill in the key, project ID, an email and password, tap **Create account** once, then **Save & sync now**.

## Supabase

1. Create a project at supabase.com.
2. SQL editor, run:
   ```sql
   create table public.guardbox_backups (
     user_id uuid primary key default auth.uid() references auth.users on delete cascade,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table public.guardbox_backups enable row level security;
   create policy "own row" on public.guardbox_backups
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```
3. Authentication > Providers: Email is on by default. Turn off "Confirm email" if you don't want to click a confirmation link.
4. Project settings > API: copy the **Project URL** and the **anon / publishable key**.
5. In GuardBox: choose Supabase, fill in the fields, tap **Create account**, then **Save & sync now**.

## AWS

Uses Cognito for sign-in and one private S3 object per user (`private/<identity id>/guardbox-backup.json`).

1. **S3**: create a private bucket (block all public access stays on).
2. **Cognito User Pool**: create one with email sign-in. Add an **app client without a client secret** and enable the `ALLOW_USER_PASSWORD_AUTH` flow. Create your user (and confirm it) in the console.
3. **Cognito Identity Pool**: create one, add the user pool + app client as an authentication provider. For the authenticated role, attach this policy (replace `BUCKET`):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:GetObject", "s3:PutObject"],
       "Resource": "arn:aws:s3:::BUCKET/private/${cognito-identity.amazonaws.com:sub}/*"
     }]
   }
   ```
4. In GuardBox: choose AWS and enter region, user pool ID, app client ID, identity pool ID, bucket, username and password, then **Save & sync now**.
