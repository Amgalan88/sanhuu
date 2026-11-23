export const CONSENT_REQUIRED = 'Нууцлалын бодлого, Үйлчилгээний нөхцөлийг зөвшөөрч байна гэж тэмдэглэнэ үү.';

export function signupAllowed(checked) {
  return checked === true;
}

export function consentCheckboxHtml() {
  return `<div class="consent">
    <input type="checkbox" id="consent" name="consent" value="yes">
    <label for="consent"><a href="privacy.html">Нууцлалын бодлого</a>, <a href="terms.html">Үйлчилгээний нөхцөл</a>ийг зөвшөөрч байна</label>
  </div>`;
}

export function consentRecord({ userId, version, acceptedAt }) {
  if (!userId) throw new Error('Хэрэглэгч олдсонгүй');
  if (!version) throw new Error('Бодлогын хувилбар олдсонгүй');
  if (!acceptedAt) throw new Error('Зөвшөөрсөн цаг олдсонгүй');
  return {
    user_id: userId,
    policy_version: version,
    accepted_at: acceptedAt,
  };
}
