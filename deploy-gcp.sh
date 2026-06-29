#!/bin/bash
set -e

# Colors for nice output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}===================================================${NC}"
echo -e "${BLUE}   GCP Cloud Run Deployer for Jobs Finder App      ${NC}"
echo -e "${BLUE}===================================================${NC}"

# Check for gcloud CLI
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed. Please install it first.${NC}"
    exit 1
fi

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
    echo -e "${YELLOW}No active GCP project detected.${NC}"
    read -p "Please enter your GCP Project ID: " PROJECT_ID
    gcloud config set project "$PROJECT_ID"
fi
echo -e "${GREEN}Using GCP Project ID: $PROJECT_ID${NC}"

# Configurable variables with defaults
REGION=${REGION:-"us-central1"} # us-central1 has free tier GCS & Cloud Run
SERVICE_NAME="jobs-finder"
REPO_NAME="jobs-repo"
BUCKET_NAME="${PROJECT_ID}-jobs-storage"

# Verify free-tier region choice
if [[ "$REGION" != "us-central1" && "$REGION" != "us-east1" && "$REGION" != "us-west1" ]]; then
    echo -e "${YELLOW}Warning: Region '$REGION' might not be eligible for GCP GCS/Cloud Run free tier.${NC}"
    echo -e "${YELLOW}Free-tier eligible regions are: us-central1, us-east1, us-west1.${NC}"
    read -p "Do you want to switch to us-central1 (recommended) [Y/n]? " switch_region
    if [[ $switch_region != "n" && $switch_region != "N" ]]; then
        REGION="us-central1"
    fi
fi
echo -e "${GREEN}Deploying to region: $REGION${NC}"

# Load Telegram Bot configuration
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
    echo -e "${YELLOW}Telegram configurations not found in environment.${NC}"
    read -p "Enter Telegram Bot Token: " TELEGRAM_BOT_TOKEN
    read -p "Enter Telegram Chat ID: " TELEGRAM_CHAT_ID
fi

# Generate or use a secret token for securing scheduler endpoint
if [ -z "$UPDATE_TOKEN" ]; then
    UPDATE_TOKEN=$(LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/dev/urandom | fold -w 32 | head -n 1 2>/dev/null || echo "SecretToken$(date +%s)")
    echo -e "${GREEN}Generated secret UPDATE_TOKEN: $UPDATE_TOKEN${NC}"
fi

# Enable necessary GCP APIs
echo -e "${BLUE}[1/6] Enabling Google Cloud APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    cloudscheduler.googleapis.com \
    storage.googleapis.com

# Create GCS Bucket
echo -e "${BLUE}[2/6] Setting up Google Cloud Storage bucket: $BUCKET_NAME...${NC}"
if gcloud storage buckets describe gs://$BUCKET_NAME &>/dev/null; then
    echo -e "${GREEN}GCS Bucket already exists.${NC}"
else
    # Create regional bucket in selected free-tier region
    gcloud storage buckets create gs://$BUCKET_NAME --location=$REGION --uniform-bucket-level-access
    echo -e "${GREEN}Created GCS Bucket: gs://$BUCKET_NAME${NC}"
fi

# Create Artifact Registry repo
echo -e "${BLUE}[3/6] Setting up Artifact Registry repository: $REPO_NAME...${NC}"
if gcloud artifacts repositories describe $REPO_NAME --location=$REGION &>/dev/null; then
    echo -e "${GREEN}Artifact Registry repository already exists.${NC}"
else
    gcloud artifacts repositories create $REPO_NAME \
        --repository-format=docker \
        --location=$REGION \
        --description="Docker repository for Jobs App"
    echo -e "${GREEN}Created Artifact Registry: $REPO_NAME${NC}"
fi

# Build and Push Image using Cloud Build (fully serverless & free-tier eligible)
echo -e "${BLUE}[4/6] Building and pushing Docker container via Google Cloud Build...${NC}"
IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"
gcloud builds submit --tag "$IMAGE_URL" .

# Create/Configure Service Account for Cloud Run
echo -e "${BLUE}[5/6] Setting up IAM permissions for Cloud Run...${NC}"
RUN_SA_NAME="jobs-run-identity"
RUN_SA_EMAIL="${RUN_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$RUN_SA_EMAIL" &>/dev/null; then
    gcloud iam service-accounts create "$RUN_SA_NAME" \
        --display-name="Service Account for Jobs Cloud Run Service"
    echo -e "${GREEN}Created service account: $RUN_SA_EMAIL${NC}"
fi

# Grant Service Account access to write/read the bucket
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUN_SA_EMAIL}" \
    --role="roles/storage.objectAdmin" &>/dev/null

# Deploy Cloud Run service
echo -e "${BLUE}[6/6] Deploying service to Google Cloud Run...${NC}"
gcloud run deploy "$SERVICE_NAME" \
    --image="$IMAGE_URL" \
    --region="$REGION" \
    --service-account="$RUN_SA_EMAIL" \
    --port=8080 \
    --memory=512Mi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=1 \
    --allow-unauthenticated \
    --set-env-vars="GCS_BUCKET_NAME=${BUCKET_NAME},TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN},TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID},UPDATE_TOKEN=${UPDATE_TOKEN},SKIP_CATALOG_MERGE=1"

# Get Cloud Run Service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')
echo -e "${GREEN}Cloud Run Service URL: $SERVICE_URL${NC}"

# Setup Cloud Scheduler (Triggers the Cloud Run scraper every 30 minutes)
SCHEDULER_JOB_NAME="jobs-scraper-trigger"
echo -e "${BLUE}Configuring Cloud Scheduler trigger...${NC}"

# Delete existing scheduler job if it exists to refresh configuration
if gcloud scheduler jobs describe "$SCHEDULER_JOB_NAME" --location=$REGION &>/dev/null; then
    gcloud scheduler jobs delete "$SCHEDULER_JOB_NAME" --location=$REGION --quiet
fi

# Create new Cloud Scheduler job
# Triggers POST /api/run-update?token=... every 30 minutes
# Cloud Run starts up from 0 to 1 instance, performs scraper run, and shuts back down to 0
gcloud scheduler jobs create http "$SCHEDULER_JOB_NAME" \
    --location="$REGION" \
    --schedule="*/30 * * * *" \
    --uri="${SERVICE_URL}/api/run-update?token=${UPDATE_TOKEN}" \
    --http-method="POST" \
    --time-zone="UTC" \
    --description="Periodically triggers the jobs app scraping run every 30 minutes"

echo -e "${GREEN}===================================================${NC}"
echo -e "${GREEN}   Deployment Complete!                            ${NC}"
echo -e "${GREEN}===================================================${NC}"
echo -e "Frontend UI is accessible at: ${YELLOW}${SERVICE_URL}${NC}"
echo -e "Scraper trigger configured in Cloud Scheduler: ${YELLOW}${SCHEDULER_JOB_NAME}${NC}"
echo -e "Security Token for trigger: ${YELLOW}${UPDATE_TOKEN}${NC}"
echo -e "GCS Bucket for persistent data storage: gs://${BUCKET_NAME}"
echo -e "Check your Telegram Bot. It is now ready to receive job alerts."
echo -e "${GREEN}===================================================${NC}"
