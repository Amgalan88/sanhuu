export const DELETE_CONFIRM_WORD = 'УСТГАХ';

export function canConfirmDelete(typed) {
  return String(typed ?? '').trim().toUpperCase() === DELETE_CONFIRM_WORD;
}

export function renderDataSettings({ demo = false } = {}) {
  return `
    <h2>🔒 Мэдээлэл</h2>
    <p class="note">Нууцлалын бодлого, үйлчилгээний нөхцөл, өрхийн хуулга, данс устгах.</p>
    <div class="legal-links">
      <a class="btn block" href="privacy.html">Нууцлалын бодлого</a>
      <a class="btn block" href="terms.html">Үйлчилгээний нөхцөл</a>
      <button type="button" class="btn block" id="export-data">Мэдээлэл татах</button>
      <button type="button" class="btn danger block" id="delete-account">Данс устгах</button>
    </div>
    <form id="delete-account-form" class="delete-account" hidden>
      <p class="note">Энэ үйлдлийг буцаахгүй. Та өрхийн сүүлийн гишүүн бол өрхийн орлого, зарлага, шилжүүлэг, зорилт хамт устана. Өөр гишүүн үлдвэл өрхийн мэдээлэл үлдэнэ, зөвхөн таны нэвтрэлт хаагдана.</p>
      ${demo ? '<p class="note">Демо горимд зөвхөн энэ хөтчийн өгөгдөл арилна.</p>' : ''}
      <label for="delete-confirm">Баталгаажуулахын тулд ${DELETE_CONFIRM_WORD} гэж бичнэ үү</label>
      <input class="field" id="delete-confirm" name="confirm" autocomplete="off" autocapitalize="characters" enterkeyhint="done">
      <button type="submit" class="btn danger block" id="delete-account-go" disabled>Данс устгах</button>
    </form>`;
}
