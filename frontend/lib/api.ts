"use client";

import { getStoredToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787/api";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | FormData | Record<string, unknown> | null;
};

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function normalizeBody(body: RequestOptions["body"]) {
  if (!body) {
    return { body: undefined, isFormData: false };
  }
  if (body instanceof FormData) {
    return { body, isFormData: true };
  }
  if (typeof body === "string" || body instanceof Blob || body instanceof URLSearchParams) {
    return { body, isFormData: false };
  }
  return { body: JSON.stringify(body), isFormData: false };
}

function buildUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, isFormData } = normalizeBody(options.body ?? null);
  const headers = new Headers(options.headers ?? {});

  if (!isFormData && body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
    body,
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    const message =
      (typeof data === "object" &&
        data !== null &&
        "message" in data &&
        typeof (data as { message?: unknown }).message === "string" &&
        (data as { message: string }).message) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export async function authRequest<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers ?? {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return request<T>(path, {
    ...options,
    headers,
  });
}

export type Module = any;
export type Permission = any;
export type RoleDetail = any;
export type RoleListItem = any;
export type RoleStats = any;
export type EducationalCenter = any;
export type GpsDevice = any;
export type Student = any;
export type StudentHistoryEntry = any;
export type StudentStats = any;
export type StudentsResponse = any;
export type UserDetail = any;
export type UserListItem = any;
export type UserStats = any;
export type UsersResponse = any;
export type Child = any;
export type ChildTutorAssociation = any;
export type ChildTutorAssociationHistory = any;
export type ChildTutorAssociationStats = any;
export type TutorListItem = any;
export type ChildPayload = any;
export type ChildrenResponse = any;
export type ChildrenStats = any;
export type EducationalCenterPayload = any;
export type EducationalCenterStats = any;
export type EducationalCentersResponse = any;
export type RegentOption = any;
export type GpsDeviceDetail = any;
export type GpsDeviceHistoryEntry = any;
export type GpsDevicesResponse = any;
export type GpsDeviceStats = any;
export type RegentDetail = any;
export type RegentEducationalCenter = any;
export type RegentListItem = any;
export type RegentsResponse = any;
export type RegentsStats = any;
export type RiskZone = any;
export type RiskZoneLevel = any;
export type RiskZoneMetrics = any;
export type RiskZonePayload = any;
export type RiskZoneStats = any;
export type RiskZoneType = any;
export type SafeAreaCoordinate = [number, number];
export type SafeAreaPolygon = any;
export type SafeArea = any;
export type SafeAreaHistory = any;
export type SafeAreaStats = any;
export type SafeAreaStatus = any;
export type SecurityAlertDetail = any;
export type SecurityAlertHistoryResponse = any;
export type SecurityAlertListItem = any;
export type SecurityAlertPriority = any;
export type SecurityAlertStats = any;
export type SecurityAlertStatus = any;
export type TutorDetail = any;
export type TutorPayload = any;
export type TutorStats = any;
export type TutorsResponse = any;
export type PickupDeliveryItem = any;
export type PickupDeliveriesResponse = any;
export type AccessControlRecordItem = any;
export type BullyingSimulationVideoOption = any;
export type BullyingSimulationAnalysisItem = any;

export async function loginRequest(email: string, password: string) {
  return request("/auth/login/", {
    method: "POST",
    headers: { "X-Client-Platform": "web" },
    body: { email, password },
  });
}

export async function getRoles(params?: any) {
  return authRequest(`/roles/${withQuery(params)}`);
}

export async function getRoleById(roleId: number) {
  return authRequest(`/roles/${roleId}/`);
}

export async function getRoleStats() {
  return authRequest("/roles/stats/");
}

export async function getModules() {
  return authRequest("/modules/");
}

export async function getPermissions() {
  return authRequest("/permissions/");
}

export async function createRole(payload: any) {
  return authRequest("/roles/", { method: "POST", body: payload });
}

export async function updateRole(roleId: number, payload: any) {
  return authRequest(`/roles/${roleId}/`, { method: "PUT", body: payload });
}

export async function updateRoleStatus(roleId: number, payload: any) {
  return authRequest(`/roles/${roleId}/status/`, { method: "PATCH", body: payload });
}

export async function deleteRole(roleId: number) {
  return authRequest(`/roles/${roleId}/`, { method: "DELETE" });
}

export async function getUsers(params?: any) {
  return authRequest(`/users/${withQuery(params)}`);
}

export async function getUserById(userId: number) {
  return authRequest(`/users/${userId}/`);
}

export async function getUserStats() {
  return authRequest("/users/stats/");
}

export async function createUser(payload: any) {
  return authRequest("/users/", { method: "POST", body: payload });
}

export async function updateUser(userId: number, payload: any) {
  return authRequest(`/users/${userId}/`, { method: "PUT", body: payload });
}

export async function updateUserStatus(userId: number, payload: any) {
  return authRequest(`/users/${userId}/status/`, { method: "PATCH", body: payload });
}

export async function deleteUser(userId: number) {
  return authRequest(`/users/${userId}/`, { method: "DELETE" });
}

export async function getStudents(params?: any) {
  return authRequest(`/students/${withQuery(params)}`);
}

export async function getStudentById(studentId: number) {
  return authRequest(`/students/${studentId}/`);
}

export async function getStudentStats() {
  return authRequest("/students/stats/");
}

export async function getStudentHistory(studentId: number) {
  return authRequest(`/students/${studentId}/history/`);
}

export async function createStudent(payload: any) {
  return authRequest("/students/", { method: "POST", body: payload });
}

export async function updateStudent(studentId: number, payload: any) {
  return authRequest(`/students/${studentId}/`, { method: "PUT", body: payload });
}

export async function updateStudentStatus(studentId: number, payload: any) {
  return authRequest(`/students/${studentId}/status/`, { method: "PATCH", body: payload });
}

export async function deleteStudent(studentId: number) {
  return authRequest(`/students/${studentId}/`, { method: "DELETE" });
}

export async function getChildren(params?: any) {
  return authRequest(`/children/${withQuery(params)}`);
}

export async function getChildById(childId: number) {
  return authRequest(`/children/${childId}/`);
}

export async function getChildrenStats() {
  return authRequest("/children/stats/");
}

export async function createChild(payload: any) {
  return authRequest("/children/", { method: "POST", body: payload });
}

export async function updateChild(childId: number, payload: any) {
  return authRequest(`/children/${childId}/`, { method: "PUT", body: payload });
}

export async function updateChildStatus(childId: number, payload: any) {
  return authRequest(`/children/${childId}/status/`, { method: "PATCH", body: payload });
}

export async function deleteChild(childId: number) {
  return authRequest(`/children/${childId}/`, { method: "DELETE" });
}

export async function getEducationalCenters(params?: any) {
  return authRequest(`/educational-centers/${withQuery(params)}`);
}

export async function getEducationalCenterById(centerId: number) {
  return authRequest(`/educational-centers/${centerId}/`);
}

export async function getEducationalCenterStats() {
  return authRequest("/educational-centers/stats/");
}

export async function createEducationalCenter(payload: any) {
  return authRequest("/educational-centers/", { method: "POST", body: payload });
}

export async function updateEducationalCenter(centerId: number, payload: any) {
  return authRequest(`/educational-centers/${centerId}/`, { method: "PUT", body: payload });
}

export async function updateEducationalCenterStatus(centerId: number, payload: any) {
  return authRequest(`/educational-centers/${centerId}/status/`, { method: "PATCH", body: payload });
}

export async function deleteEducationalCenter(centerId: number) {
  return authRequest(`/educational-centers/${centerId}/`, { method: "DELETE" });
}

export async function getRegents(params?: any) {
  return authRequest(`/regents/${withQuery(params)}`);
}

export async function getRegentById(regentId: number) {
  return authRequest(`/regents/${regentId}/`);
}

export async function getRegentStats() {
  return authRequest("/regents/stats/");
}

export async function getRegentOptions() {
  return authRequest("/regents/options/");
}

export async function getRegentEducationalCenters(regentId?: number) {
  if (typeof regentId === "number") {
    return authRequest(`/regents/${regentId}/educational-centers/`);
  }
  return authRequest("/regents/educational-centers/");
}

export async function createRegent(payload: any) {
  return authRequest("/regents/", { method: "POST", body: payload });
}

export async function updateRegent(regentId: number, payload: any) {
  return authRequest(`/regents/${regentId}/`, { method: "PUT", body: payload });
}

export async function updateRegentStatus(regentId: number, payload: any) {
  return authRequest(`/regents/${regentId}/status/`, { method: "PATCH", body: payload });
}

export async function deleteRegent(regentId: number) {
  return authRequest(`/regents/${regentId}/`, { method: "DELETE" });
}

export async function getGpsDevices(params?: any) {
  return authRequest(`/gps-devices/available/${withQuery(params)}`);
}

export async function getGpsDevicesAdmin(params?: any) {
  return authRequest(`/gps-devices/${withQuery(params)}`);
}

export async function getGpsDeviceById(gpsDeviceId: number) {
  return authRequest(`/gps-devices/${gpsDeviceId}/`);
}

export async function getGpsDeviceStats() {
  return authRequest("/gps-devices/stats/");
}

export async function getGpsDeviceHistory(gpsDeviceId: number) {
  return authRequest(`/gps-devices/${gpsDeviceId}/history/`);
}

export async function createGpsDevice(payload: any) {
  return authRequest("/gps-devices/", { method: "POST", body: payload });
}

export async function updateGpsDevice(gpsDeviceId: number, payload: any) {
  return authRequest(`/gps-devices/${gpsDeviceId}/`, { method: "PUT", body: payload });
}

export async function updateGpsDeviceStatus(gpsDeviceId: number, payload: any) {
  return authRequest(`/gps-devices/${gpsDeviceId}/status/`, { method: "PATCH", body: payload });
}

export async function deleteGpsDevice(gpsDeviceId: number) {
  return authRequest(`/gps-devices/${gpsDeviceId}/`, { method: "DELETE" });
}

export async function getRiskZones(params?: any) {
  return authRequest(`/risk-zones/${withQuery(params)}`);
}

export async function getRiskZoneById(riskZoneId: number) {
  return authRequest(`/risk-zones/${riskZoneId}/`);
}

export async function getRiskZoneStats() {
  return authRequest("/risk-zones/stats/");
}

export async function validateRiskZonePolygon(payload: any) {
  return authRequest("/risk-zones/validate-polygon/", { method: "POST", body: payload });
}

export async function calculateRiskZone(payload: any) {
  return authRequest("/risk-zones/calculate/", { method: "POST", body: payload });
}

export async function createRiskZone(payload: any) {
  return authRequest("/risk-zones/", { method: "POST", body: payload });
}

export async function updateRiskZone(riskZoneId: number, payload: any) {
  return authRequest(`/risk-zones/${riskZoneId}/`, { method: "PUT", body: payload });
}

export async function updateRiskZoneStatus(riskZoneId: number, payload: any) {
  return authRequest(`/risk-zones/${riskZoneId}/status/`, { method: "PATCH", body: payload });
}

export async function deleteRiskZone(riskZoneId: number) {
  return authRequest(`/risk-zones/${riskZoneId}/`, { method: "DELETE" });
}

export async function getSafeAreaByCenter(centerId: number) {
  return authRequest(`/safe-areas/by-center/${centerId}/`);
}

export async function getSafeAreaStats() {
  return authRequest("/safe-areas/stats/");
}

export async function getSafeAreaHistory(safeAreaId: number) {
  return authRequest(`/safe-areas/${safeAreaId}/history/`);
}

export async function validateSafeAreaPolygon(payload: any) {
  return authRequest("/safe-areas/validate-polygon/", { method: "POST", body: payload });
}

export async function calculateSafeArea(payload: any) {
  return authRequest("/safe-areas/calculate/", { method: "POST", body: payload });
}

export async function createSafeArea(payload: any) {
  return authRequest("/safe-areas/", { method: "POST", body: payload });
}

export async function updateSafeArea(safeAreaId: number, payload: any) {
  return authRequest(`/safe-areas/${safeAreaId}/`, { method: "PUT", body: payload });
}

export async function updateSafeAreaStatus(safeAreaId: number, payload: any) {
  return authRequest(`/safe-areas/${safeAreaId}/status/`, { method: "PATCH", body: payload });
}

export async function deleteSafeArea(safeAreaId: number) {
  return authRequest(`/safe-areas/${safeAreaId}/`, { method: "DELETE" });
}

export async function getSecurityAlerts(params?: any) {
  return authRequest(`/security-alerts/${withQuery(params)}`);
}

export async function getSecurityAlertById(alertId: number) {
  return authRequest(`/security-alerts/${alertId}/`);
}

export async function getSecurityAlertStats() {
  return authRequest("/security-alerts/stats/");
}

export async function getSecurityAlertHistory(alertId: number) {
  return authRequest(`/security-alerts/${alertId}/history/`);
}

export async function updateSecurityAlertStatus(alertId: number, payload: any) {
  return authRequest(`/security-alerts/${alertId}/status/`, { method: "PATCH", body: payload });
}

export async function getBullyingSimulationOptions() {
  return authRequest("/bullying-simulations/videos/");
}

export async function getBullyingSimulations(params?: any) {
  return authRequest(`/bullying-simulations/${withQuery(params)}`);
}

export async function processBullyingSimulation(payload: any) {
  return authRequest("/bullying-simulations/", { method: "POST", body: payload });
}

export async function getTutors(params?: any) {
  return authRequest(`/tutors/${withQuery(params)}`);
}

export async function getTutorById(tutorId: number) {
  return authRequest(`/tutors/${tutorId}/`);
}

export async function getTutorStats() {
  return authRequest("/tutors/stats/");
}

export async function getTutorMobileAccount(tutorId: number) {
  return authRequest(`/tutors/${tutorId}/mobile-account/`);
}

export async function createTutor(payload: any) {
  return authRequest("/tutors/", { method: "POST", body: payload });
}

export async function updateTutor(tutorId: number, payload: any) {
  return authRequest(`/tutors/${tutorId}/`, { method: "PUT", body: payload });
}

export async function updateTutorStatus(tutorId: number, payload: any) {
  return authRequest(`/tutors/${tutorId}/status/`, { method: "PATCH", body: payload });
}

export async function updateTutorChildren(tutorId: number, payload: any) {
  return authRequest(`/tutors/${tutorId}/children/`, { method: "PATCH", body: payload });
}

export async function resetTutorPassword(tutorId: number) {
  return authRequest(`/tutors/${tutorId}/reset-password/`, { method: "PATCH" });
}

export async function deleteTutor(tutorId: number) {
  return authRequest(`/tutors/${tutorId}/`, { method: "DELETE" });
}

export async function getDeliveries(params?: any) {
  return authRequest(`/deliveries/${withQuery(params)}`);
}

export async function getAccessControlRecords(params?: any) {
  return authRequest(`/access-control/${withQuery(params)}`);
}

export async function getChildTutorAssociationStats() {
  return authRequest("/child-tutor-associations/stats/");
}

export async function getChildTutorAssociationsByChild(childId: number) {
  return authRequest(`/child-tutor-associations/by-child/${childId}/`);
}

export async function getChildTutorAssociationHistory(associationId: number) {
  return authRequest(`/child-tutor-associations/${associationId}/history/`);
}

export async function createChildTutorAssociation(payload: any) {
  return authRequest("/child-tutor-associations/", { method: "POST", body: payload });
}

export async function deleteChildTutorAssociation(associationId: number) {
  return authRequest(`/child-tutor-associations/${associationId}/`, { method: "DELETE" });
}

function withQuery(params?: QueryParams) {
  if (!params) {
    return "";
  }
  const search = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  const query = search.toString();
  return query ? `?${query}` : "";
}
