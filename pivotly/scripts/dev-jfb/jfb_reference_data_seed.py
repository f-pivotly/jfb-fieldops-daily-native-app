
import base64
import json
import uuid

try:
    import requests
    REQUESTS_AVAILABLE = True
except ModuleNotFoundError:
    requests = None
    REQUESTS_AVAILABLE = False

try:
    from pivotly import (
        BOOLEAN,
        TEXT,
        PivotlyAPI,
        declare_param,
        get_privileged_secret,
    )
    PIVOTLY_AVAILABLE = True
except ModuleNotFoundError:
    BOOLEAN = "BOOLEAN"
    TEXT = "TEXT"
    PivotlyAPI = None
    PIVOTLY_AVAILABLE = False

    def declare_param(*args, **kwargs):
        if "default" in kwargs:
            return kwargs["default"]
        if len(args) > 2:
            return args[2]
        return None

    def get_privileged_secret(*args, **kwargs):
        raise RuntimeError("Pivotly runner secret helper is unavailable outside Pivotly.")


SCRIPT_VERSION = "v1-jfb-reference-data-seed-r12"

SCRIPT_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "pivotly:jfb:reference-data-seed:v1")

PARAM_CONTRACT_VERSION = "jfb_reference_seed_params_v1"

STABLE_PARAM_CONTRACT = [
    {"name": "mode", "type": "TEXT", "default": "self_check"},
    {"name": "param_contract_version", "type": "TEXT", "default": PARAM_CONTRACT_VERSION},
    {"name": "dry_run", "type": "BOOLEAN", "default": True},
    {"name": "domain_scope", "type": "TEXT", "default": "all"},
    {"name": "output_shape", "type": "TEXT", "default": "summary"},
    {"name": "app_slug", "type": "TEXT", "default": ""},
]

PUBLIC_RUNNER_PARAMS = [item["name"] for item in STABLE_PARAM_CONTRACT]

VALID_MODES = ["self_check", "seed_only"]

PARAM_DEBUG = {}


TOKEN_ENDPOINT = "https://login.microsoftonline.com/856436c2-a60d-486d-bca3-9c1367fa632a/oauth2/v2.0/token"
API_SCOPE = "api://1a10b2a3-2fbf-4cc8-b32c-634766e1172b/.default"
CLIENT_ID_SECRET = "jfb-pivotly-api-client-id"
CLIENT_SECRET_SECRET = "jfb-pivotly-api-client-secret"


APP_SLUG = "app-jfb-fieldsops-admin"


CORE_DATA_SYSTEM = "core"

PIVOTLY_API_DIAGNOSTIC = {}

SECRET_ERROR_REMEDIATION = {
    "secret_not_allowed": (
        "No approved Allowed Secrets row for this script. Admin -> Variables -> Allowed Secrets: "
        "Consumer Type=script, Consumer Slug=<this script's slug>, Variable Slug=<secret slug>, Status=approved."
    ),
    "secret_not_found": (
        "The Runner reports every failed secret read this way, so check all of these in this instance: "
        "the Secret Variable exists under exactly this slug; an approved Allowed Secrets row names this "
        "script's slug; and the value has been re-entered and saved, since saving is what writes it to the vault."
    ),
    "runner_signed_token_rejected": (
        "The runner signed-token was rejected for this job. Re-run from the Portal "
        "rather than replaying an old job, and confirm the script record is enabled."
    ),
    "secret_accessor_missing": "Unexpected Secret wrapper shape; report the runner version.",
    "secret_read_exception": "Inspect error_detail in secret_reads for the raw runner message.",
}

TOKEN_CLAIMS_TO_SHOW = ["aud", "iss", "ver", "tid", "appid", "azp", "roles", "scp", "exp"]



def parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ["1", "true", "yes", "y", "on"]


def debuggable(value):
    if value is None or isinstance(value, (bool, int, float)):
        return value
    text = str(value)
    return text if len(text) <= 120 else text[:120] + "...truncated"


def param_value(name, data_type, default):
    try:
        value = declare_param(name, data_type)
        error = ""
    except Exception as exc:
        PARAM_DEBUG[name] = {
            "declared_type": str(data_type),
            "raw_value": None,
            "returned_default": True,
            "default": debuggable(default),
            "error": safe_text(exc),
        }
        return default

    present = value is not None and not (isinstance(value, str) and value.strip() == "")

    PARAM_DEBUG[name] = {
        "declared_type": str(data_type),
        "raw_value": debuggable(value),
        "returned_default": not present,
        "default": debuggable(default),
        "error": error,
    }

    return value if present else default


def load_config():
    PARAM_DEBUG.clear()

    mode = str(param_value("mode", TEXT, "self_check"))
    if mode not in VALID_MODES:
        mode = "self_check"

    return {
        "mode": mode,
        "param_contract_version": str(param_value("param_contract_version", TEXT, PARAM_CONTRACT_VERSION)),
        "dry_run": parse_bool(param_value("dry_run", BOOLEAN, True), True),
        "domain_scope": str(param_value("domain_scope", TEXT, "all")),
        "output_shape": str(param_value("output_shape", TEXT, "summary")),
        "app_slug": str(param_value("app_slug", TEXT, "")) or APP_SLUG,
    }

SEED_DATA = {
    "jfb_layer_types": {
        "business_key": "name",
        "rows": [
            {"name": "Armor", "description": "Top protective layer (large rock / riprap)", "sort_order": 10, "active": True},
            {"name": "Cap", "description": "Primary isolation cap (clean fill)", "sort_order": 20, "active": True},
            {"name": "Cover", "description": "Cover layer over cap", "sort_order": 30, "active": True},
            {"name": "Backfill", "description": "Backfill material", "sort_order": 40, "active": True},
            {"name": "Base", "description": "Base layer below cap", "sort_order": 50, "active": True},
            {"name": "Sand", "description": "Sand layer", "sort_order": 60, "active": True},
            {"name": "Gravel", "description": "Gravel layer", "sort_order": 70, "active": True},
            {"name": "Amendment", "description": "Reactive amendment layer", "sort_order": 80, "active": True},
        ],
    },
    "jfb_material_types": {
        "business_key": "name",
        "rows": [
            {"name": "Sand", "description": "Sand material", "sort_order": 10, "active": True},
            {"name": "Gravel", "description": "Gravel material", "sort_order": 20, "active": True},
            {"name": "Rock", "description": "Rock / riprap material", "sort_order": 30, "active": True},
            {"name": "Amended", "description": "Amended material (sand + amendment)", "sort_order": 40, "active": True},
            {"name": "Dredge Slurry", "description": "Hydraulic dredge slurry placement", "sort_order": 50, "active": True},
            {"name": "Clean Fill", "description": "Generic clean fill", "sort_order": 60, "active": True},
            {"name": "Other", "description": "Project-specific catch-all", "sort_order": 99, "active": True},
        ],
    },
    "jfb_component_types": {
        "business_key": "name",
        "rows": [
            {"name": "Sand", "description": "Sand component", "sort_order": 10, "active": True},
            {"name": "Gravel", "description": "Gravel component", "sort_order": 20, "active": True},
            {"name": "Amendment", "description": "Reactive amendment", "sort_order": 30, "active": True},
            {"name": "Open", "description": "Open / placeholder", "sort_order": 99, "active": True},
        ],
    },
    "jfb_work_types": {
        "business_key": "name",
        "rows": [
            {"name": "Hydraulic Dredging"},
            {"name": "Hydraulic Capping"},
            {"name": "Mechanical Dredging"},
            {"name": "Mechanical Capping"},
        ],
    },
    "jfb_culture_tenants": {
        "business_key": "name",
        "rows": [
            {"name": "PROFESSIONALISM", "description": "We hold ourselves to the highest standard in every interaction, on and off the job site.", "sort_order": 10, "active": True},
            {"name": "TEAMWORK", "description": "We work together across crews and disciplines to get the job done safely and well.", "sort_order": 20, "active": True},
            {"name": "FOCUS ON CLIENTS", "description": "We deliver on our commitments and keep the client's goals at the center of every decision.", "sort_order": 30, "active": True},
            {"name": "SAFETY FIRST", "description": "No task is so urgent that it cannot be done safely.", "sort_order": 40, "active": True},
            {"name": "INTEGRITY", "description": "We do the right thing, especially when no one is watching.", "sort_order": 50, "active": True},
            {"name": "CONTINUOUS IMPROVEMENT", "description": "We look for a better way to do the job every single day.", "sort_order": 60, "active": True},
            {"name": "ACCOUNTABILITY", "description": "When problems occur, it is incumbent upon the individual or team to take full ownership and explain the issue at hand so that we can cooperatively, without blame, correct the problem. We actively promote an environment where each of us can openly present our concerns and take responsibility for our actions.", "sort_order": 100, "active": True},
            {"name": "COMMUNICATION", "description": "We believe open and honest communication builds trust, the foundation of relationships. Success is ultimately determined by our interactions with coworkers, customers, suppliers, communities, and other stakeholders.", "sort_order": 160, "active": True},
            {"name": "DEDICATION", "description": "We understand that loyalty to our teammates and dedication to our work are vital to our success. Our individual commitment to work as a cohesive unit creates unique opportunities and makes a rewarding difference in our families' lives.", "sort_order": 110, "active": True},
            {"name": "DEVELOPMENT", "description": "Our future success relies on the continuous development of employee skills. We operate in an environment where we serve as mentors, provide training, and strive to improve every day. We give open and honest feedback so we can further development by learning from experience.", "sort_order": 60, "active": True},
            {"name": "EFFICIENCY", "description": "We conduct all aspects of our work efficiently. Each day, we analyze our activities to identify more efficient means and methods. We are mindful that our competitive edge within the marketplace is based on continuously efficient work operations.", "sort_order": 30, "active": True},
            {"name": "ENVIRONMENTAL STEWARDSHIP", "description": "We recognize that our work can significantly impact the environment. We adhere to all environmental laws, keep our job sites clean, and leave our work areas in better condition than we found them.", "sort_order": 180, "active": True},
            {"name": "ETHICAL BEHAVIOR", "description": "We adhere to the highest ethical standards in every facet of our work. We always comply with the law, stand by our commitments, communicate transparently, and empower every individual, regardless of position, to report unethical behaviors in the workplace.", "sort_order": 170, "active": True},
            {"name": "FAMILY", "description": "Our unique work requires us to spend a large portion of our time away from our families, and we value the significance of a work-life balance. Therefore, Brennan careers must provide better opportunities for our team members and their families.", "sort_order": 130, "active": True},
            {"name": "FINANCIAL MANAGEMENT", "description": "Brennan's success depends on sound financial management. We accept our duty to understand the impact that our expenditures have on the bottom line. We use corporate resources judiciously for the furtherance of executing our work.", "sort_order": 120, "active": True},
            {"name": "FOCUS ON CLIENT", "description": "We provide specialized services to a limited customer base and for this reason, each of our clients is of the utmost importance. Every person in the company is responsible for ensuring customer satisfaction in all aspects of our work. We listen, communicate effectively, and deliver on our promises.", "sort_order": 150, "active": True},
            {"name": "FUN", "description": "We strive to make all aspects of work enjoyable and to show regular appreciation of our successes. Good morale makes Brennan a great place to work.", "sort_order": 140, "active": True},
            {"name": "INNOVATION", "description": "We seek the opportunity for innovation in every task we perform, collectively understanding that innovative ideas arise from even routine or simple tasks. We are empowered to propose and implement innovations that challenge the status quo.", "sort_order": 40, "active": True},
            {"name": "LEADERSHIP", "description": "People come to Brennan because of their skillsets and stay because of their leadership. We realize leaders are not always defined by position; rather, leadership is demonstrated through the ability to positively influence a coworker or client in a manner that upholds the Brennan culture.", "sort_order": 90, "active": True},
            {"name": "QUALITY", "description": "The quality of our work reflects directly on our organization. Quality shows in our finished products and in our professional work practices. A deliberate and consistent focus on high quality leads to customer satisfaction as well as additional opportunities.", "sort_order": 20, "active": True},
            {"name": "RESPECT", "description": "We respect each other, our clients, and our competitors with a humble disposition. We create a work environment that encourages new ideas and fosters respectful resolution of disagreements. Those who cannot respect others are asked to leave.", "sort_order": 80, "active": True},
            {"name": "SAFETY", "description": "Our commitment to safety is the highest priority of our work. It is the critical responsibility of each and every Brennan team member, regardless of position. We pre-plan all features of work, holding ourselves and those around us accountable to stop work whenever the well-being of any individual is compromised.", "sort_order": 10, "active": True},
        ],
    },
    "jfb_metric_sources": {
        "business_key": "value",
        "rows": [
            {"value": "manual", "label": "Manual (PE enters daily)", "unit": None, "sort_order": 10, "result_column": None, "active": True, "description": None},
            {"value": "dvw-jfb-metric-cy-v2", "label": "Auto · CY from production stats", "unit": "CY", "sort_order": 20, "result_column": "total_volume", "active": True, "description": None},
            {"value": "dvw-jfb-metric-sf-v2", "label": "Auto · SF from production stats", "unit": "SF", "sort_order": 30, "result_column": "total_area", "active": True, "description": None},
            {"value": "dvw-jfb-metric-tons-v2", "label": "Auto · Tons from production stats", "unit": "TON", "sort_order": 40, "result_column": "total_tons", "active": True, "description": None},
            {"value": "dvw-jfb-metric-hours-op-v2", "label": "Auto · Operating Hours", "unit": "hrs", "sort_order": 50, "result_column": "op_hours", "active": True, "description": None},
            {"value": "dvw-jfb-metric-hours-delay-v2", "label": "Auto · Delay Hours", "unit": "hrs", "sort_order": 60, "result_column": "delay_hours", "active": True, "description": None},
            {"value": "dvw-jfb-metric-efficiency-v2", "label": "Auto · Efficiency %", "unit": "%", "sort_order": 70, "result_column": "efficiency_pct", "active": True, "description": None},
            {"value": "auto_discharge_mg", "label": "Auto · Water Treatment Discharge MG (pending DB)", "unit": "MG", "sort_order": 80, "result_column": None, "active": True, "description": "No data view yet; renders blank until a discharge source exists, matching the reference app."},
        ],
    },
    "jfb_metric_defaults": {
        "business_key": "metric_key",
        "rows": [
            {"metric_key": "total_cy", "label": "Total Volume Removed", "source": "dvw-jfb-metric-cy-v2", "unit": "CY", "sort_order": 10},
            {"metric_key": "total_sf", "label": "Total Area Covered", "source": "dvw-jfb-metric-sf-v2", "unit": "SF", "sort_order": 20},
            {"metric_key": "hours_op", "label": "Operating Hours", "source": "dvw-jfb-metric-hours-op-v2", "unit": "hrs", "sort_order": 30},
            {"metric_key": "hours_delay", "label": "Delay Hours", "source": "dvw-jfb-metric-hours-delay-v2", "unit": "hrs", "sort_order": 40},
            {"metric_key": "efficiency", "label": "Efficiency", "source": "dvw-jfb-metric-efficiency-v2", "unit": "%", "sort_order": 50},
        ],
    },
    "jfb_narrative_section_defaults": {
        "business_key": "label",
        "rows": [
            {"label": "Mobilization/Demobilization", "sort_order": 10, "is_active": True},
            {"label": "Dredging Operations", "sort_order": 20, "is_active": True},
            {"label": "Dewatering / Water Treatment", "sort_order": 30, "is_active": True},
            {"label": "Survey Operations", "sort_order": 40, "is_active": True},
            {"label": "Sampling", "sort_order": 50, "is_active": True},
            {"label": "Material Loadout", "sort_order": 60, "is_active": True},
            {"label": "Miscellaneous", "sort_order": 70, "is_active": True},
            {"label": "Additional Site Activities", "sort_order": 80, "is_active": True},
        ],
    },
}

DELAY_CODE_ROWS = [
    {"work_type": "Hydraulic Dredging", "category": "General", "category_num": 1, "code": "ShutDown", "code_num": 0, "sort_order": 0, "active": True, "notes": "Code # proposed (was blank in the master sheet) - see Data Issues."},
    {"work_type": "Hydraulic Dredging", "category": "General", "category_num": 1, "code": "Startup", "code_num": 1, "sort_order": 1, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "General", "category_num": 1, "code": "General Dredge Maintenance", "code_num": 2, "sort_order": 2, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "General", "category_num": 1, "code": "Mobilize to New Areas", "code_num": 3, "sort_order": 3, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "General", "category_num": 1, "code": "Subcontractor", "code_num": 4, "sort_order": 4, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "General", "category_num": 1, "code": "Debris Management", "code_num": 5, "sort_order": 5, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Mechanical", "category_num": 20, "code": "Wash Pipeline", "code_num": 20, "sort_order": 20, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Mechanical", "category_num": 20, "code": "Clean Cutterhead", "code_num": 21, "sort_order": 21, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Mechanical", "category_num": 20, "code": "Clean/Repair Main Pump", "code_num": 22, "sort_order": 22, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Mechanical", "category_num": 20, "code": "Change/Repair Cutterhead", "code_num": 23, "sort_order": 23, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Mechanical", "category_num": 20, "code": "Service Water", "code_num": 24, "sort_order": 24, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Mechanical", "category_num": 20, "code": "Spuds", "code_num": 25, "sort_order": 25, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Mechanical", "category_num": 20, "code": "Generator", "code_num": 26, "sort_order": 26, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Mechanical", "category_num": 20, "code": "Thruster", "code_num": 27, "sort_order": 27, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Mechanical", "category_num": 20, "code": "Dredge Hydraulics", "code_num": 28, "sort_order": 28, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Mechanical", "category_num": 20, "code": "Engine Room", "code_num": 29, "sort_order": 29, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Movement", "category_num": 30, "code": "Move Dredge", "code_num": 30, "sort_order": 30, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Movement", "category_num": 30, "code": "Move Pipeline", "code_num": 31, "sort_order": 31, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Movement", "category_num": 30, "code": "Repair/Replace Pipeline", "code_num": 32, "sort_order": 32, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Movement", "category_num": 30, "code": "Add/Remove Pipeline", "code_num": 33, "sort_order": 33, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Movement", "category_num": 30, "code": "Adjust Anchors/Line", "code_num": 34, "sort_order": 34, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Survey/Sample", "category_num": 40, "code": "Sensors/DredgePack/GPS", "code_num": 40, "sort_order": 40, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Survey/Sample", "category_num": 40, "code": "Survey", "code_num": 41, "sort_order": 41, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Survey/Sample", "category_num": 40, "code": "Calibration", "code_num": 42, "sort_order": 42, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Survey/Sample", "category_num": 40, "code": "Sampling", "code_num": 43, "sort_order": 43, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Booster/Land Plant", "category_num": 50, "code": "Clean/Repair Booster Pump", "code_num": 50, "sort_order": 50, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Booster/Land Plant", "category_num": 50, "code": "Service Water Booster Pump", "code_num": 51, "sort_order": 51, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Booster/Land Plant", "category_num": 50, "code": "Booster Generator", "code_num": 52, "sort_order": 52, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Booster/Land Plant", "category_num": 50, "code": "Sediment Processing", "code_num": 53, "sort_order": 53, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Booster/Land Plant", "category_num": 50, "code": "Water Treament Plant", "code_num": 54, "sort_order": 54, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Booster/Land Plant", "category_num": 50, "code": "Dewatering", "code_num": 55, "sort_order": 55, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Booster/Land Plant", "category_num": 50, "code": "CDF", "code_num": 56, "sort_order": 56, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Booster/Land Plant", "category_num": 50, "code": "Land Booster", "code_num": 57, "sort_order": 57, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Booster/Land Plant", "category_num": 50, "code": "Sand Wheel", "code_num": 58, "sort_order": 58, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Misc", "category_num": 90, "code": "Water Quality", "code_num": 90, "sort_order": 90, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Misc", "category_num": 90, "code": "Weather", "code_num": 91, "sort_order": 91, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Misc", "category_num": 90, "code": "Miscellaneous", "code_num": 92, "sort_order": 92, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Misc", "category_num": 90, "code": "Turbidity", "code_num": 93, "sort_order": 93, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Misc", "category_num": 90, "code": "Safety", "code_num": 94, "sort_order": 94, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Misc", "category_num": 90, "code": "Pressure Testing", "code_num": 95, "sort_order": 95, "active": True, "notes": None},
    {"work_type": "Hydraulic Dredging", "category": "Operational Change", "category_num": None, "code": "Operational Change", "code_num": 996, "sort_order": 996, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "General", "category_num": 201, "code": "ShutDown", "code_num": 200, "sort_order": 200, "active": True, "notes": "Code # proposed (was blank in the master sheet) - see Data Issues."},
    {"work_type": "Hydraulic Capping", "category": "General", "category_num": 201, "code": "Startup", "code_num": 201, "sort_order": 201, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "General", "category_num": 201, "code": "Maintenance", "code_num": 202, "sort_order": 202, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "General", "category_num": 201, "code": "Mobilize Spreader to New Area", "code_num": 203, "sort_order": 203, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "General", "category_num": 201, "code": "Subcontractor", "code_num": 204, "sort_order": 204, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "General", "category_num": 201, "code": "Debris Management", "code_num": 205, "sort_order": 205, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Mechanical", "category_num": 220, "code": "Wash Pipeline", "code_num": 220, "sort_order": 220, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Mechanical", "category_num": 220, "code": "Clean/Repair Spinners", "code_num": 221, "sort_order": 221, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Mechanical", "category_num": 220, "code": "Belt/Belt Scales", "code_num": 222, "sort_order": 222, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Mechanical", "category_num": 220, "code": "Separators", "code_num": 223, "sort_order": 223, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Mechanical", "category_num": 220, "code": "Shaker Screen", "code_num": 224, "sort_order": 224, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Mechanical", "category_num": 220, "code": "Spuds", "code_num": 225, "sort_order": 225, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Mechanical", "category_num": 220, "code": "Generator", "code_num": 226, "sort_order": 226, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Mechanical", "category_num": 220, "code": "Slurry Tank", "code_num": 227, "sort_order": 227, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Mechanical", "category_num": 220, "code": "Clear Debris from Tanks/Pumps", "code_num": 228, "sort_order": 228, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Mechanical", "category_num": 220, "code": "Dozer/Island Equipment", "code_num": 229, "sort_order": 229, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Movement", "category_num": 230, "code": "Move Spreader", "code_num": 230, "sort_order": 230, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Movement", "category_num": 230, "code": "Move Pipeline", "code_num": 231, "sort_order": 231, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Movement", "category_num": 230, "code": "Repair/Replace Pipeline", "code_num": 232, "sort_order": 232, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Movement", "category_num": 230, "code": "Add/Remove Pipeline", "code_num": 233, "sort_order": 233, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Movement", "category_num": 230, "code": "Adjust Anchors/Line", "code_num": 234, "sort_order": 234, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Movement", "category_num": 230, "code": "Traverse Winch", "code_num": 235, "sort_order": 235, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Movement", "category_num": 230, "code": "Positioning Winch", "code_num": 236, "sort_order": 236, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Movement", "category_num": 230, "code": "Reset Guide Barge", "code_num": 237, "sort_order": 237, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Survey/Sample", "category_num": 240, "code": "Sensors/DredgePack/GPS", "code_num": 240, "sort_order": 240, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Survey/Sample", "category_num": 240, "code": "Survey", "code_num": 241, "sort_order": 241, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Survey/Sample", "category_num": 240, "code": "Calibration", "code_num": 242, "sort_order": 242, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Survey/Sample", "category_num": 240, "code": "Sampling/Poling", "code_num": 243, "sort_order": 243, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Booster/Land Plant", "category_num": 250, "code": "Clean/Repair Booster Pump", "code_num": 250, "sort_order": 250, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Booster/Land Plant", "category_num": 250, "code": "Service Water Pump", "code_num": 251, "sort_order": 251, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Booster/Land Plant", "category_num": 250, "code": "Booster Generator", "code_num": 252, "sort_order": 252, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Booster/Land Plant", "category_num": 250, "code": "Land Plant", "code_num": 253, "sort_order": 253, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Booster/Land Plant", "category_num": 250, "code": "Water Intake Plant", "code_num": 254, "sort_order": 254, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Booster/Land Plant", "category_num": 250, "code": "Wait for Material Import", "code_num": 255, "sort_order": 255, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Barge/Material Transport", "category_num": 260, "code": "Change Barge", "code_num": 260, "sort_order": 260, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Barge/Material Transport", "category_num": 260, "code": "Rotate/Move Barge", "code_num": 261, "sort_order": 261, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Barge/Material Transport", "category_num": 260, "code": "Wait For Material Barge", "code_num": 262, "sort_order": 262, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Barge/Material Transport", "category_num": 260, "code": "Barge Maintenance", "code_num": 263, "sort_order": 263, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Barge/Material Transport", "category_num": 260, "code": "Pushboat Maintenance", "code_num": 264, "sort_order": 264, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Barge/Material Transport", "category_num": 260, "code": "Material_Handler/Excavator Maintenance", "code_num": 265, "sort_order": 265, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Barge/Material Transport", "category_num": 260, "code": "Bucket Maintenance", "code_num": 266, "sort_order": 266, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Barge/Material Transport", "category_num": 260, "code": "Fuel Equipment", "code_num": 267, "sort_order": 267, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Barge/Material Transport", "category_num": 260, "code": "Rub Rails", "code_num": 268, "sort_order": 268, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Misc", "category_num": 290, "code": "Water Quality", "code_num": 290, "sort_order": 290, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Misc", "category_num": 290, "code": "Weather", "code_num": 291, "sort_order": 291, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Misc", "category_num": 290, "code": "Miscellaneous", "code_num": 292, "sort_order": 292, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Misc", "category_num": 290, "code": "Turbidity", "code_num": 293, "sort_order": 293, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Misc", "category_num": 290, "code": "Safety", "code_num": 294, "sort_order": 294, "active": True, "notes": None},
    {"work_type": "Hydraulic Capping", "category": "Operational Change", "category_num": None, "code": "Operational Change", "code_num": 998, "sort_order": 998, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "General", "category_num": 101, "code": "ShutDown", "code_num": 100, "sort_order": 100, "active": True, "notes": "Code # proposed (was blank in the master sheet) - see Data Issues."},
    {"work_type": "Mechanical Dredging", "category": "General", "category_num": 101, "code": "Startup", "code_num": 101, "sort_order": 101, "active": True, "notes": "Code # proposed (was blank in the master sheet) - see Data Issues."},
    {"work_type": "Mechanical Dredging", "category": "General", "category_num": 101, "code": "Maintenance", "code_num": 102, "sort_order": 102, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "General", "category_num": 101, "code": "Mobilize Plant to New Area", "code_num": 103, "sort_order": 103, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "General", "category_num": 101, "code": "Subcontractor", "code_num": 104, "sort_order": 104, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "General", "category_num": 101, "code": "Debris Management", "code_num": 105, "sort_order": 105, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "General", "category_num": 101, "code": "Obstructions", "code_num": 110, "sort_order": 110, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Mechanical", "category_num": 120, "code": "HPU", "code_num": 120, "sort_order": 120, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Mechanical", "category_num": 120, "code": "Change/Repair Bucket", "code_num": 123, "sort_order": 123, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Mechanical", "category_num": 120, "code": "Spuds", "code_num": 125, "sort_order": 125, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Mechanical", "category_num": 120, "code": "Generator", "code_num": 126, "sort_order": 126, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Mechanical", "category_num": 120, "code": "Excavator Hydraulics", "code_num": 128, "sort_order": 128, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Mechanical", "category_num": 120, "code": "Excavator Repairs", "code_num": 129, "sort_order": 129, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Movement", "category_num": 130, "code": "Move Dredge Plant", "code_num": 130, "sort_order": 130, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Movement", "category_num": 130, "code": "Repair/Replace Pipeline", "code_num": 131, "sort_order": 131, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Movement", "category_num": 130, "code": "Add/Remove Pipeline", "code_num": 132, "sort_order": 132, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Movement", "category_num": 130, "code": "Move Pipeline", "code_num": 133, "sort_order": 133, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Survey/Sample", "category_num": 140, "code": "Sensors/DredgePack/GPS", "code_num": 140, "sort_order": 140, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Survey/Sample", "category_num": 140, "code": "Survey", "code_num": 141, "sort_order": 141, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Survey/Sample", "category_num": 140, "code": "Calibration", "code_num": 142, "sort_order": 142, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Survey/Sample", "category_num": 140, "code": "Sampling/Poling", "code_num": 143, "sort_order": 143, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Land Plant/Processing", "category_num": 150, "code": "Clean/Repair Booster Pump", "code_num": 150, "sort_order": 150, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Land Plant/Processing", "category_num": 150, "code": "Service Water Booster Pump", "code_num": 151, "sort_order": 151, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Land Plant/Processing", "category_num": 150, "code": "Booster Generator", "code_num": 152, "sort_order": 152, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Land Plant/Processing", "category_num": 150, "code": "Sediment Processing", "code_num": 153, "sort_order": 153, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Land Plant/Processing", "category_num": 150, "code": "Water Treatment Plant", "code_num": 154, "sort_order": 154, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Land Plant/Processing", "category_num": 150, "code": "Dewatering", "code_num": 155, "sort_order": 155, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Barge/Material Transport", "category_num": 160, "code": "Change Barge", "code_num": 160, "sort_order": 160, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Barge/Material Transport", "category_num": 160, "code": "Rotate/Move Barge", "code_num": 161, "sort_order": 161, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Barge/Material Transport", "category_num": 160, "code": "Wait on Barge", "code_num": 162, "sort_order": 162, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Barge/Material Transport", "category_num": 160, "code": "Barge Maintenance", "code_num": 163, "sort_order": 163, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Barge/Material Transport", "category_num": 160, "code": "Pushboat Maintenance", "code_num": 164, "sort_order": 164, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Barge/Material Transport", "category_num": 160, "code": "Material_Handler/Excavator Maintenance", "code_num": 165, "sort_order": 165, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Barge/Material Transport", "category_num": 160, "code": "Bucket Maintenance", "code_num": 166, "sort_order": 166, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Barge/Material Transport", "category_num": 160, "code": "Fuel Equipment", "code_num": 167, "sort_order": 167, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Barge/Material Transport", "category_num": 160, "code": "Rub Rails", "code_num": 168, "sort_order": 168, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Barge/Material Transport", "category_num": 160, "code": "Clean/Repair Slurry Tank", "code_num": 169, "sort_order": 169, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Misc", "category_num": 190, "code": "Water Quality", "code_num": 190, "sort_order": 190, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Misc", "category_num": 190, "code": "Weather", "code_num": 191, "sort_order": 191, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Misc", "category_num": 190, "code": "Miscellaneous", "code_num": 192, "sort_order": 192, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Misc", "category_num": 190, "code": "Turbidity", "code_num": 193, "sort_order": 193, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Misc", "category_num": 190, "code": "Safety", "code_num": 194, "sort_order": 194, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Booster/Land Plant", "category_num": None, "code": "Dredge Plant Boster", "code_num": 170, "sort_order": 170, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Booster/Land Plant", "category_num": None, "code": "Land Booster", "code_num": 171, "sort_order": 171, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Booster/Land Plant", "category_num": None, "code": "Service Water", "code_num": 172, "sort_order": 172, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Booster/Land Plant", "category_num": None, "code": "Sand Wheel", "code_num": 173, "sort_order": 173, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Booster/Land Plant", "category_num": None, "code": "Wash Pipeline", "code_num": 174, "sort_order": 174, "active": True, "notes": None},
    {"work_type": "Mechanical Dredging", "category": "Operational Change", "category_num": None, "code": "Operational Change", "code_num": 997, "sort_order": 997, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "General", "category_num": 301, "code": "ShutDown", "code_num": 300, "sort_order": 300, "active": True, "notes": "Code # proposed (was 301 in the master sheet) - see Data Issues."},
    {"work_type": "Mechanical Capping", "category": "General", "category_num": 301, "code": "Startup", "code_num": 301, "sort_order": 301, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "General", "category_num": 301, "code": "Maintenance", "code_num": 302, "sort_order": 302, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "General", "category_num": 301, "code": "Mobilize Plant to New Area", "code_num": 303, "sort_order": 303, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "General", "category_num": 301, "code": "Subcontractor", "code_num": 304, "sort_order": 304, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "General", "category_num": 301, "code": "Debris Management", "code_num": 305, "sort_order": 305, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Mechanical", "category_num": 320, "code": "Change/Repair Bucket", "code_num": 323, "sort_order": 323, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Mechanical", "category_num": 320, "code": "Spuds", "code_num": 325, "sort_order": 325, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Mechanical", "category_num": 320, "code": "Generator", "code_num": 326, "sort_order": 326, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Mechanical", "category_num": 320, "code": "Excavator Hydarulics", "code_num": 328, "sort_order": 328, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Mechanical", "category_num": 320, "code": "Excavator Repairs", "code_num": 329, "sort_order": 329, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Movement", "category_num": 330, "code": "Move Placement Plant", "code_num": 330, "sort_order": 330, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Survey/Sample", "category_num": 340, "code": "Sensors/DredgePack/GPS", "code_num": 340, "sort_order": 340, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Survey/Sample", "category_num": 340, "code": "Survey", "code_num": 341, "sort_order": 341, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Survey/Sample", "category_num": 340, "code": "Calibration", "code_num": 342, "sort_order": 342, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Survey/Sample", "category_num": 340, "code": "Sampling/Poling", "code_num": 343, "sort_order": 343, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Booster or Land Plant", "category_num": 350, "code": "Clean/Repair Booster Pump", "code_num": 350, "sort_order": 350, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Booster or Land Plant", "category_num": 350, "code": "Service Water Pump", "code_num": 351, "sort_order": 351, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Booster or Land Plant", "category_num": 350, "code": "Booster Generator", "code_num": 352, "sort_order": 352, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Booster or Land Plant", "category_num": 350, "code": "Land Plant", "code_num": 353, "sort_order": 353, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Booster or Land Plant", "category_num": 350, "code": "Water Intake Plant", "code_num": 354, "sort_order": 354, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Booster or Land Plant", "category_num": 350, "code": "Wait for Material Import", "code_num": 355, "sort_order": 355, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Barge/Material Transport", "category_num": 360, "code": "Change Barge", "code_num": 360, "sort_order": 360, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Barge/Material Transport", "category_num": 360, "code": "Rotate/Move Barge", "code_num": 361, "sort_order": 361, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Barge/Material Transport", "category_num": 360, "code": "Wait on Barge", "code_num": 362, "sort_order": 362, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Barge/Material Transport", "category_num": 360, "code": "Barge Maintenance", "code_num": 363, "sort_order": 363, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Barge/Material Transport", "category_num": 360, "code": "Pushboat Maintenance", "code_num": 364, "sort_order": 364, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Barge/Material Transport", "category_num": 360, "code": "Material_Handler/Excavator Maintenance", "code_num": 365, "sort_order": 365, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Barge/Material Transport", "category_num": 360, "code": "Bucket Maintenance", "code_num": 366, "sort_order": 366, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Barge/Material Transport", "category_num": 360, "code": "Fuel Equipment", "code_num": 367, "sort_order": 367, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Barge/Material Transport", "category_num": 360, "code": "Rub Rails", "code_num": 368, "sort_order": 368, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Misc", "category_num": 390, "code": "Water Quality", "code_num": 390, "sort_order": 390, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Misc", "category_num": 390, "code": "Weather", "code_num": 391, "sort_order": 391, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Misc", "category_num": 390, "code": "Miscellaneous", "code_num": 392, "sort_order": 392, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Misc", "category_num": 390, "code": "Turbidity", "code_num": 393, "sort_order": 393, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Misc", "category_num": 390, "code": "Safety", "code_num": 394, "sort_order": 394, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Project Specific", "category_num": None, "code": "Belt Maintenance", "code_num": 370, "sort_order": 370, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Project Specific", "category_num": None, "code": "Roller Maintenance", "code_num": 371, "sort_order": 371, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Project Specific", "category_num": None, "code": "Clean Hopper", "code_num": 372, "sort_order": 372, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Project Specific", "category_num": None, "code": "Move Plant", "code_num": 373, "sort_order": 373, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Project Specific", "category_num": None, "code": "Loading Excavator", "code_num": 374, "sort_order": 374, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Project Specific", "category_num": None, "code": "Wheel Loader", "code_num": 375, "sort_order": 375, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Project Specific", "category_num": None, "code": "Import Truck Delay", "code_num": 376, "sort_order": 376, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Project Specific", "category_num": None, "code": "Other Contractor Delay", "code_num": 377, "sort_order": 377, "active": True, "notes": None},
    {"work_type": "Mechanical Capping", "category": "Operational Change", "category_num": None, "code": "Operational Change", "code_num": 999, "sort_order": 999, "active": True, "notes": None},
]

SEED_DATA["jfb_delay_codes"] = {
    "business_key": "code_num",
    "references": {
        "work_type": {"domain": "jfb_work_types", "key": "name", "column": "work_type_id"},
    },
    "rows": DELAY_CODE_ROWS,
}

ALL_SEED_DOMAIN_SLUGS = list(SEED_DATA.keys())


def resolve_domain_scope(domain_scope):
    """Returns (slugs_in_scope, unknown_slugs) for a domain_scope param value."""
    raw = str(domain_scope or "all").strip()
    if raw == "" or raw.lower() == "all":
        return list(ALL_SEED_DOMAIN_SLUGS), []

    requested = [item.strip() for item in raw.split(",") if item.strip()]
    known = [slug for slug in requested if slug in SEED_DATA]
    unknown = [slug for slug in requested if slug not in SEED_DATA]
    return known, unknown


def safe_text(value, max_length=400):
    text = str(value or "")

    for marker in ["Authorization:", "authorization:", "Bearer ", "bearer "]:
        if marker in text:
            head, _sep, _tail = text.partition(marker)
            text = head + marker + "[REDACTED]"
            break

    if len(text) > max_length:
        return text[:max_length] + "...truncated"
    return text


def classify_secret_error(exc):
    text = str(exc or "").lower()
    if "not allowed" in text or "not permitted" in text or "forbidden" in text or "403" in text:
        return "secret_not_allowed"
    if "not found" in text or "404" in text or "does not exist" in text:
        return "secret_not_found"
    if "token" in text and ("signed" in text or "purpose" in text or "job" in text):
        return "runner_signed_token_rejected"
    return "secret_read_exception"


def privileged_secret_raw(secret_key):
    try:
        secret = get_privileged_secret(secret_key)
    except Exception as exc:
        return "", classify_secret_error(exc), safe_text(exc)

    try:
        if hasattr(secret, "get_raw"):
            raw = secret.get_raw()
        elif hasattr(secret, "_get_raw"):
            raw = secret._get_raw()
        else:
            return "", "secret_accessor_missing", "Secret wrapper exposes neither get_raw nor _get_raw."
    except Exception as exc:
        return "", classify_secret_error(exc), safe_text(exc)

    return str(raw or "").strip(), "", ""


def token_claims(token):
    try:
        payload = str(token or "").split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")).decode("utf-8"))
    except Exception as exc:
        return {"decode_error": safe_text(exc)}
    return {key: claims.get(key) for key in TOKEN_CLAIMS_TO_SHOW if key in claims}


def get_pivotly_api_safe():
    global PIVOTLY_API_DIAGNOSTIC
    PIVOTLY_API_DIAGNOSTIC = {
        "stage": "start",
        "token_status": "",
        "token_error": "",
        "token_error_description": "",
        "secret_reads": {},
        "token_endpoint": TOKEN_ENDPOINT,
        "api_scope": API_SCOPE,
    }

    if not PIVOTLY_AVAILABLE or PivotlyAPI is None:
        PIVOTLY_API_DIAGNOSTIC["stage"] = "import"
        PIVOTLY_API_DIAGNOSTIC["token_error"] = "pivotly_helper_unavailable"
        return None

    if not REQUESTS_AVAILABLE:
        PIVOTLY_API_DIAGNOSTIC["stage"] = "import"
        PIVOTLY_API_DIAGNOSTIC["token_error"] = "requests_unavailable"
        return None

    try:
        PIVOTLY_API_DIAGNOSTIC["stage"] = "secret_read"

        client_id, id_error, id_detail = privileged_secret_raw(CLIENT_ID_SECRET)
        client_secret, secret_error, secret_detail = privileged_secret_raw(CLIENT_SECRET_SECRET)

        PIVOTLY_API_DIAGNOSTIC["secret_reads"] = {
            CLIENT_ID_SECRET: {
                "value": "present" if client_id else "missing",
                "error_code": id_error,
                "error_detail": id_detail,
            },
            CLIENT_SECRET_SECRET: {
                "value": "present" if client_secret else "missing",
                "error_code": secret_error,
                "error_detail": secret_detail,
            },
        }

        first_error = id_error or secret_error
        if first_error:
            PIVOTLY_API_DIAGNOSTIC["token_error"] = first_error
            PIVOTLY_API_DIAGNOSTIC["token_error_description"] = id_detail or secret_detail
            PIVOTLY_API_DIAGNOSTIC["remediation"] = SECRET_ERROR_REMEDIATION.get(
                first_error, "Inspect secret_reads for the failing secret slug."
            )
            return None

        if not client_id or not client_secret:
            PIVOTLY_API_DIAGNOSTIC["token_error"] = "missing_client_credential_value"
            PIVOTLY_API_DIAGNOSTIC["remediation"] = (
                "The secret read worked but the Variable is empty. Store the actual credential value, not a secret ID."
            )
            return None

        PIVOTLY_API_DIAGNOSTIC["stage"] = "token_post"
        response = requests.post(
            TOKEN_ENDPOINT,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": API_SCOPE,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        PIVOTLY_API_DIAGNOSTIC["token_status"] = str(response.status_code)

        try:
            body = response.json()
        except Exception:
            body = {}

        if response.status_code >= 400 or not body.get("access_token"):
            PIVOTLY_API_DIAGNOSTIC["token_error"] = str(body.get("error", "token_http_error"))
            PIVOTLY_API_DIAGNOSTIC["token_error_description"] = safe_text(body.get("error_description", ""))
            PIVOTLY_API_DIAGNOSTIC["remediation"] = (
                "Secrets resolved but the token endpoint rejected them. Check the client id/secret "
                "values, TOKEN_ENDPOINT tenant, and API_SCOPE audience for this environment."
            )
            return None

        PIVOTLY_API_DIAGNOSTIC["stage"] = "token_ready"
        PIVOTLY_API_DIAGNOSTIC["token_claims"] = token_claims(body.get("access_token"))

        api = PivotlyAPI(
            client_id=client_id,
            client_secret=client_secret,
            token_endpoint=TOKEN_ENDPOINT,
            api_scope=API_SCOPE,
        )
        api._access_token = body.get("access_token")
        return api
    except Exception as exc:
        PIVOTLY_API_DIAGNOSTIC["token_error"] = "exception:" + type(exc).__name__
        PIVOTLY_API_DIAGNOSTIC["token_error_description"] = safe_text(exc)
        return None


def stable_uuid(label):
    return str(uuid.uuid5(SCRIPT_NAMESPACE, label))


# ---------------------------------------------------------------------------
# core-data-read / core-data-write (mirrors src/data/index.js's
# fetchDomainRecords/createDomainRecord -- see the module docstring's
# UNCONFIRMED section for the endpoint-path and response-shape caveats)


# ---------------------------------------------------------------------------

def read_domain_records(api, domain, app_slug, limit=1000):
    """Reads up to `limit` non-deleted records for one domain. Returns a
    list of record dicts (each including its business fields).

    app_slug is accepted but deliberately NOT sent -- it was only ever
    copied from the native app frontend's own convention (src/data/index.js
    always sends it because a browser session runs inside one specific
    app's iframe). The P2 Python Runner authoring guide's own documented
    core-data-write/-read contract (SS0.3, 17) lists parameters as domain,
    system, operation, latency only -- no app_slug. A live run confirmed
    every one of these 8 domains 500ing with message="READ_ACCESS_DENIED"
    despite the calling service account having a global read/insert/update/
    delete DAC policy, which points at app_slug triggering an extra,
    unintended app-scoped access check a script was never meant to hit.
    """
    payload = {
        "parameters": {
            "domain": domain,
            "system": CORE_DATA_SYSTEM,
            "limit": limit,
            "offset": 0,
        }
    }
    response = api._request("POST", "/api/v3/core-data-read", data=payload)

    if isinstance(response, list):
        return response
    if isinstance(response, dict):
        data = response.get("data")
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]
        if isinstance(data, dict) and isinstance(data.get("rows"), list):
            return data["rows"]
    return []


def write_domain_record_insert(api, domain, app_slug, record_data):
    # app_slug accepted but not sent -- see read_domain_records()'s docstring.
    payload = {
        "parameters": {
            "domain": domain,
            "system": CORE_DATA_SYSTEM,
            "operation": "insert",
            "latency": "synchronous",
        },
        "data": record_data,
    }
    return api._request("POST", "/api/v3/core-data-write", data=payload)


def raw_diagnostic_core_data_read(api, domain):
    """One unwrapped HTTP call to the exact endpoint read_domain_records()
    hits, using the same bearer token PivotlyAPI already holds -- per the P2
    authoring guide S12.4, PivotlyAPI's own retry wrapper summarizes repeated
    500s into "too many 500 error responses" and discards the actual
    response body, which is the only place Core's real validation/crash
    detail (e.g. an auth-context or DAC message) would show up. This makes
    exactly one extra call, only after read_domain_records() has already
    failed, so it adds no cost to a working run.
    """
    if not REQUESTS_AVAILABLE:
        return {"raw_status": None, "raw_body": "requests_unavailable"}

    token = getattr(api, "_access_token", None)
    if not token:
        return {"raw_status": None, "raw_body": "no_access_token_on_api_object"}

    # Hardcoded rather than reusing api._request()'s own path resolution --
    # a prior run's error text confirmed PivotlyAPI._request() sends
    # "/api/v3/..." paths to an actual wire URL of
    # "https://dev.pivotly.com/vm/api/v3/...", so this mirrors that exact
    # confirmed URL rather than guessing at a second, possibly different one.
    url = "https://app-jfbrennan-dev-core-api-cus-001.azurewebsites.net/vm/api/v3/core-data-read"
    payload = {
        "parameters": {
            "domain": domain,
            "system": CORE_DATA_SYSTEM,
            "limit": 1,
            "offset": 0,
        }
    }
    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
            timeout=30,
        )
        return {"raw_status": response.status_code, "raw_body": safe_text(response.text, 1500)}
    except Exception as exc:
        return {"raw_status": None, "raw_body": "raw_diagnostic_call_failed: " + safe_text(exc, 500)}


def normalize_reference_value(value):
    return str(value or "").strip().lower()


def resolve_references(api, entry, app_slug, dry_run):
    references = entry.get("references") or {}
    lookups = {}
    for field, ref in references.items():
        records = read_domain_records(api, ref["domain"], app_slug)
        lookups[field] = {
            normalize_reference_value(record.get(ref["key"])): record.get("id")
            for record in records
            if isinstance(record, dict) and record.get("id")
        }

    resolved_rows = []
    unresolved = {}
    for row in entry["rows"]:
        new_row = {key: value for key, value in row.items() if key not in references}
        complete = True
        for field, ref in references.items():
            target_id = lookups[field].get(normalize_reference_value(row.get(field)))
            if target_id:
                new_row[ref["column"]] = target_id
            else:
                complete = False
                unresolved.setdefault(field, set()).add(str(row.get(field)))
        if complete or dry_run:
            resolved_rows.append(new_row)

    report = {
        field: {
            "domain": ref["domain"],
            "matched_on": ref["key"],
            "records_found": len(lookups[field]),
            "unresolved": sorted(unresolved.get(field, set())),
        }
        for field, ref in references.items()
    }
    return resolved_rows, report


def seed_one_domain(api, slug, business_key, rows, app_slug, dry_run):
    """Seeds one domain's missing rows. Returns a per-domain result dict."""
    try:
        existing_records = read_domain_records(api, slug, app_slug)
    except Exception as exc:
        return {
            "slug": slug,
            "ok": False,
            "error": "read_failed: " + safe_text(exc, 800),
            "raw_diagnostic": raw_diagnostic_core_data_read(api, slug),
        }

    existing_keys = set()
    for record in existing_records:
        if isinstance(record, dict) and business_key in record:
            existing_keys.add(str(record[business_key]))

    to_create = [row for row in rows if str(row.get(business_key)) not in existing_keys]
    already_present = [row.get(business_key) for row in rows if str(row.get(business_key)) in existing_keys]

    if dry_run:
        return {
            "slug": slug,
            "ok": True,
            "existing_row_count": len(existing_records),
            "already_present_keys": already_present,
            "would_create_keys": [row.get(business_key) for row in to_create],
            "dry_run": True,
        }

    created_keys = []
    errors = []
    for row in to_create:
        try:
            write_domain_record_insert(api, slug, app_slug, row)
            created_keys.append(row.get(business_key))
        except Exception as exc:
            errors.append(str(row.get(business_key)) + ": " + safe_text(exc, 800))

    return {
        "slug": slug,
        "ok": len(errors) == 0,
        "existing_row_count": len(existing_records),
        "already_present_keys": already_present,
        "created_keys": created_keys,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Modes


# ---------------------------------------------------------------------------

def result(name, ok, message, count=0, details=None):
    return {
        "name": name,
        "ok": bool(ok),
        "message": message,
        "count": int(count),
        "details": details or {},
    }


def check_seed_domain_shape(slug, entry):
    failures = []
    business_key = entry.get("business_key")
    rows = entry.get("rows")

    if not business_key:
        failures.append("missing_business_key")
    if not isinstance(rows, list) or not rows:
        failures.append("empty_or_missing_rows")
        rows = []

    for row in rows:
        if not isinstance(row, dict) or business_key not in row or row.get(business_key) in (None, ""):
            failures.append("row_missing_business_key_value:" + str(row))

    keys_seen = [row.get(business_key) for row in rows if isinstance(row, dict)]
    duplicates = {k for k in keys_seen if keys_seen.count(k) > 1}
    if duplicates:
        failures.append("duplicate_business_key_values:" + ",".join(str(d) for d in duplicates))

    for field, ref in (entry.get("references") or {}).items():
        values = {str(row.get(field) or "").strip() for row in rows if isinstance(row, dict)}
        if "" in values:
            failures.append("row_missing_reference_value:" + field)
        seeded_parent = SEED_DATA.get(ref["domain"])
        if seeded_parent:
            parent_values = {str(r.get(ref["key"]) or "").strip() for r in seeded_parent["rows"]}
            unknown = sorted(v for v in values - parent_values if v)
            if unknown:
                failures.append("reference_not_in_seeded_" + ref["domain"] + ":" + ",".join(unknown))

    return failures, {"slug": slug, "business_key": business_key, "row_count": len(rows)}


def self_check(config):
    slugs, unknown_slugs = resolve_domain_scope(config["domain_scope"])

    api = get_pivotly_api_safe()
    token_ready = api is not None

    all_failures = []
    per_domain = {}

    if unknown_slugs:
        all_failures.append("unknown_domain_scope_slugs:" + ",".join(unknown_slugs))

    for slug in slugs:
        failures, info = check_seed_domain_shape(slug, SEED_DATA[slug])
        per_domain[slug] = {"failures": failures, "info": info}
        if failures:
            all_failures.extend([slug + ":" + f for f in failures])

    if not config["app_slug"] or config["app_slug"] == "REPLACE_WITH_NATIVE_APP_SLUG":
        all_failures.append("app_slug_not_configured -- set APP_SLUG in this script or pass the app_slug Runner param")

    if not token_ready:
        if PIVOTLY_AVAILABLE:
            all_failures.append("core_api_token_unavailable:" + str(PIVOTLY_API_DIAGNOSTIC.get("token_error") or "unknown"))
        else:
            all_failures.append("pivotly_api_unavailable_outside_runner")

    return result(
        "self_check",
        len(all_failures) == 0,
        "Self-check passed." if not all_failures else "Self-check found contract problems.",
        len(slugs),
        {
            "domain_scope": config["domain_scope"],
            "domain_count_in_scope": len(slugs),
            "unknown_domain_scope_slugs": unknown_slugs,
            "all_seed_domain_slugs": list(ALL_SEED_DOMAIN_SLUGS),
            "per_domain": per_domain,
            "valid_modes": VALID_MODES,
            "param_contract_version": config["param_contract_version"],
            "param_contract_version_ok": config["param_contract_version"] == PARAM_CONTRACT_VERSION,
            "accepted_param_names": list(PUBLIC_RUNNER_PARAMS),
            "app_slug_configured": bool(config["app_slug"]) and config["app_slug"] != "REPLACE_WITH_NATIVE_APP_SLUG",
            "dry_run": config["dry_run"],
            "token_ready": token_ready,
            "write_ready": token_ready and not all_failures,
            "pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC),
            "diagnostics": {"failures": all_failures},
        },
    )


def seed_only(config):
    slugs, unknown_slugs = resolve_domain_scope(config["domain_scope"])

    if unknown_slugs:
        return result(
            "seed_only",
            False,
            "domain_scope named slugs this script doesn't know about.",
            0,
            {"unknown_domain_scope_slugs": unknown_slugs, "all_seed_domain_slugs": list(ALL_SEED_DOMAIN_SLUGS)},
        )

    if not config["app_slug"] or config["app_slug"] == "REPLACE_WITH_NATIVE_APP_SLUG":
        return result(
            "seed_only",
            False,
            "app_slug is not configured. Set APP_SLUG in this script (from Pivotly Admin > Native Apps) "
            "or pass the app_slug Runner param, then re-run.",
            0,
            {},
        )

    api = get_pivotly_api_safe()
    if api is None:
        return result(
            "seed_only",
            False,
            "Pivotly API helper is not configured in this runner context.",
            0,
            {"pivotly_api": dict(PIVOTLY_API_DIAGNOSTIC)},
        )

    per_domain = {}
    errors = []
    for slug in slugs:
        entry = SEED_DATA[slug]
        rows = entry["rows"]
        reference_report = None
        if entry.get("references"):
            try:
                rows, reference_report = resolve_references(api, entry, config["app_slug"], config["dry_run"])
            except Exception as exc:
                per_domain[slug] = {"slug": slug, "ok": False, "error": "reference_read_failed: " + safe_text(exc, 800)}
                errors.append(slug + ": reference_read_failed")
                continue
        outcome = seed_one_domain(api, slug, entry["business_key"], rows, config["app_slug"], config["dry_run"])
        if reference_report is not None:
            outcome["references"] = reference_report
            unresolved = {f: r["unresolved"] for f, r in reference_report.items() if r["unresolved"]}
            if unresolved and not config["dry_run"]:
                outcome["ok"] = False
                outcome.setdefault("errors", []).append(
                    "rows skipped, no matching record for: " + json.dumps(unresolved, sort_keys=True)
                )
            elif unresolved:
                outcome["reference_note"] = (
                    "Not found yet: " + json.dumps(unresolved, sort_keys=True)
                    + ". Fine on a fresh instance if those records are created earlier in this same run."
                )
        per_domain[slug] = outcome
        if not outcome.get("ok"):
            errors.append(slug + ": " + str(outcome.get("error") or outcome.get("errors")))

    if config["dry_run"]:
        total_would_create = sum(len(v.get("would_create_keys") or []) for v in per_domain.values())
        message = (
            "Dry run: would create " + str(total_would_create) + " row(s) across "
            + str(len(slugs)) + " domain(s). No writes performed."
        )
    elif errors:
        message = "Seeding completed with errors."
    else:
        total_created = sum(len(v.get("created_keys") or []) for v in per_domain.values())
        message = "Seeding complete: " + str(total_created) + " row(s) created across " + str(len(slugs)) + " domain(s)."

    return result(
        "seed_only",
        len(errors) == 0,
        message,
        len(slugs),
        {
            "domain_scope": config["domain_scope"],
            "app_slug": config["app_slug"],
            "per_domain": per_domain,
            "errors": errors,
        },
    )


def run(config):
    if config["mode"] == "seed_only":
        output = seed_only(config)
    else:
        output = self_check(config)

    output["script_version"] = SCRIPT_VERSION
    output["mode"] = config["mode"]
    output["dry_run"] = config["dry_run"]
    output["param_contract_version"] = config["param_contract_version"]
    output["accepted_param_count"] = len(PUBLIC_RUNNER_PARAMS)

    output["param_resolution"] = dict(PARAM_DEBUG)
    output["params_using_default"] = sorted(
        name for name, info in PARAM_DEBUG.items() if info.get("returned_default")
    )
    output["param_errors"] = {
        name: info.get("error") for name, info in PARAM_DEBUG.items() if info.get("error")
    }

    if config.get("output_shape") == "summary":
        output["details"].pop("per_domain", None)

    return output


def main():
    print(json.dumps(run(load_config()), sort_keys=True))
    return 0


raise SystemExit(main())
