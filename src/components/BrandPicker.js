import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Linking, StyleSheet } from "react-native";
import { Button, Choices, Field, ui } from "./WalletUi";
import BrandIcon from "./BrandIcon";
import { findBrand, searchCatalogue, catalogueSuggestions } from "../utils/brandCatalogue";
import { matchesSearch } from "../utils/searchText";
import { BENEFITS, chooseCatalogue, chooseBenefit, customProduct, changeMoneyInput, moneyInput, prepareCatalogueForm } from "../utils/catalogueForm";
import { loadBrandPreferences, toggleFavouriteBrand } from "../services/brandPreferences";

export default function BrandPicker({ form, onChange, uid, disabled }) {
  const [expanded, setExpanded] = useState(!form.catalogue), [query, setQuery] = useState("");
  const [category, setCategory] = useState("all"), [group, setGroup] = useState("all"), [menuQuery, setMenuQuery] = useState("");
  const [preferences, setPreferences] = useState({ favourites: [], recent: [] });
  const [loaded, setLoaded] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [extras, setExtras] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    loadBrandPreferences(uid).then((value) => { if (alive.current) setPreferences(value); })
      .catch((e) => { if (alive.current) setError(e.message); }).finally(() => { if (alive.current) setLoaded(true); });
    return () => { alive.current = false; };
  }, [uid]);
  const current = form.catalogue, brand = findBrand(current?.brandId);
  useEffect(() => { if (current?.brandId) setExpanded(false); }, [current?.brandId]);
  const product = brand?.products.find((item) => item.id === current?.productId);
  const ids = group === "all" ? null : group === "favourites" ? preferences.favourites : preferences.recent;
  const results = searchCatalogue(query, { category, ids });
  if (group === "recent") results.sort((a, b) => ids.indexOf(a.brand.id) - ids.indexOf(b.brand.id));
  const choose = (selected, menu = null, variantId = null) => {
    onChange(chooseCatalogue(form, selected.id, menu?.id, variantId, menu ? "product" : selected.defaultBenefitType));
    setExpanded(false); setMenuQuery("");
  };
  const favourite = async (id) => {
    if (pending || disabled || !loaded) return;
    setPending(true); setError("");
    try { const value = await toggleFavouriteBrand(uid, id); if (alive.current) setPreferences(value); }
    catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setPending(false); }
  };
  const star = (item) => {
    const selected = preferences.favourites.includes(item.id);
    return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${item.name} 즐겨찾기 ${selected ? "제거" : "추가"}`}
      accessibilityState={{ selected, disabled: disabled || pending || !loaded }} disabled={disabled || pending || !loaded}
      onPress={() => favourite(item.id)} style={styles.star}><Text style={{ color: selected ? "#A16207" : "#64748B", fontSize: 24 }}>{selected ? "★" : "☆"}</Text></TouchableOpacity>;
  };
  const amount = (field, value) => onChange(changeMoneyInput(form, field, value));
  let moneyError = "";
  try { prepareCatalogueForm(form); } catch (e) { moneyError = e.message; }
  const suggestions = form.catalogueSuggestionText ? catalogueSuggestions(form.catalogueSuggestionText) : [];
  return <View style={ui.card}>
    <Text accessibilityRole="header" style={ui.heading}>브랜드·메뉴 선택</Text>
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {current && <View style={styles.brandRow}>
      <BrandIcon brand={brand || { name: current.snapshot?.brandName }} />
      <View style={{ flex: 1 }}><Text style={ui.label}>{current.snapshot?.brandName}</Text>
        <Text style={ui.note}>{current.snapshot?.productName || BENEFITS.find(([id]) => id === current.benefitType)?.[1]}</Text></View>
      {brand && star(brand)}<Button label={expanded ? "선택 목록 닫기" : "브랜드 변경"} secondary disabled={disabled} onPress={() => setExpanded(!expanded)} />
    </View>}
    {(expanded || (!current && !form.catalogueManual)) && <>
      <Field label="브랜드·메뉴 검색" placeholder="폴바셋 룽고, 메가커피, ㅍㅂㅅ" value={query} onChangeText={setQuery} editable={!disabled} />
      <Choices options={[["all", "전체 브랜드"], ["favourites", "즐겨찾기"], ["recent", "최근 선택"]]} value={group} onChange={setGroup} disabled={disabled} />
      <Choices options={[["all", "모든 분류"], ["cafe", "카페"], ["retail", "쇼핑"], ["bakery", "베이커리"], ["dessert", "디저트"]]} value={category} onChange={setCategory} disabled={disabled} />
      {!results.length && <Text style={ui.note}>{group === "favourites" ? "즐겨찾기한 브랜드가 없거나 검색 조건과 맞지 않습니다." : group === "recent" ? "등록 완료한 최근 브랜드가 없거나 검색 조건과 맞지 않습니다." : "검색 결과가 없습니다. 직접 입력할 수 있습니다."}</Text>}
      <View style={styles.grid}>{results.map(({ brand: item, product: menu }) => <View key={`${item.id}:${menu?.id || "brand"}`} style={styles.tile}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={menu ? `${item.name} ${menu.name} 선택` : `${item.name} 선택`}
          accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={() => choose(item, menu)} style={styles.select}>
          <BrandIcon brand={item} /><Text style={ui.label}>{item.name}</Text>{menu && <Text style={ui.note}>{menu.name}</Text>}
        </TouchableOpacity>{!menu && star(item)}
      </View>)}</View>
      <Button label="브랜드·상품명 직접 입력" secondary disabled={disabled} onPress={() => {
        onChange({ ...form, catalogue: null, catalogueManual: true, catalogueMoneyInput: null, catalogueSuggestionText: "" }); setExpanded(false);
      }} />
      <Text style={ui.note}>즐겨찾기·최근 선택은 계정별로 이 기기에 보관됩니다.</Text>
    </>}
    {!current && form.catalogueManual && <Button label="브랜드 목록에서 선택" secondary disabled={disabled} onPress={() => setExpanded(true)} />}
    {!!suggestions.length && <View style={ui.group}>
      <Text style={ui.label}>인식된 내용의 선택 후보</Text>
      <Text style={ui.note}>원본과 맞는 항목을 직접 선택하세요.</Text>
      {suggestions.map(({ brand: item, product: menu }) => <Button key={`${item.id}:${menu?.id || "brand"}`} secondary disabled={disabled}
        label={`후보: ${item.name}${menu ? ` · ${menu.name}` : ""}`} onPress={() => { choose(item, menu); }} />)}
      <Button label="후보 닫기" secondary disabled={disabled} onPress={() => onChange({ ...form, catalogueSuggestionText: "" })} />
    </View>}
    {current && <>
      {brand?.family && <Text style={ui.note}>매머드커피와 익스프레스는 구분해 보관합니다. 쿠폰의 사용처를 확인해 주세요.</Text>}
      {!brand && <Text style={ui.note}>현재 목록에 없는 항목입니다. 저장 당시 이름·금액은 유지됩니다.</Text>}
      <Choices options={BENEFITS} value={current.benefitType} disabled={disabled} onChange={(type) => { onChange(chooseBenefit(form, type)); setMenuQuery(""); }} />
      {current.benefitType === "product" && <>
        <Field label="메뉴 검색" value={menuQuery} onChangeText={setMenuQuery} editable={!disabled} />
        <View style={ui.row}>{brand?.products.filter((p) => p.state === "active" && matchesSearch([p.name, ...p.aliases].join(" "), menuQuery)).map((p) =>
          <Button key={p.id} label={p.name} secondary={p.id !== current.productId} disabled={disabled} onPress={() => choose(brand, p)} />)}</View>
        {!brand?.products.length && <Text style={ui.note}>확인된 메뉴가 아직 없습니다. 쿠폰에 적힌 상품명을 입력해 주세요.</Text>}
        <Field label="메뉴·상품명 직접 입력" value={current.snapshot?.productName || ""} maxLength={200} editable={!disabled}
          onChangeText={(value) => onChange(customProduct(form, value))} />
        {!!product?.variants.length && <Choices options={[["", "표기 없음"], ...product.variants.map((v) => [v.id, v.name])]} value={current.variantId || ""} disabled={disabled}
          onChange={(id) => choose(brand, product, id || null)} />}
        <Field label="쿠폰에 적힌 추가 옵션" placeholder="사이즈·수량 등 (표기 없으면 빈칸)" value={current.snapshot?.variantName || ""} maxLength={200} editable={!disabled}
          onChangeText={(value) => onChange(customProduct(form, value, true))} />
      </>}
      {current.benefitType === "monetary" && <>
        <Field label="액면금액 (원)" value={moneyInput(form, "faceValue")} onChangeText={(v) => amount("faceValue", v)} keyboardType="number-pad" maxLength={16} editable={!disabled} />
        <View style={ui.row}>{[5000, 10000, 30000, 50000].map((value) => <Button key={value} secondary disabled={disabled}
          label={`${value.toLocaleString("ko-KR")}원 입력`} onPress={() => amount("faceValue", String(value))} />)}</View>
        <Text style={ui.note}>빠른 입력용 금액입니다. 실제 보유한 쿠폰의 금액과 사용 조건을 확인하세요.</Text>
        <Field label="남은 금액 (원, 수동 기록)" value={moneyInput(form, "remainingBalance")} onChangeText={(v) => amount("remainingBalance", v)} keyboardType="number-pad" maxLength={16} editable={!disabled} />
        <Text style={ui.note}>빈칸은 미확인, 0은 잔액 0원입니다. 발행처와 자동으로 연동되지 않습니다.</Text>
      </>}
      {current.benefitType === "discount" && <>
        <Field label="할인 금액 (원)" value={moneyInput(form, "discountAmount")} onChangeText={(v) => amount("discountAmount", v)} keyboardType="number-pad" maxLength={16} editable={!disabled} />
        <Field label="할인율 (%)" value={moneyInput(form, "discountPercent")} onChangeText={(v) => amount("discountPercent", v)} keyboardType="decimal-pad" maxLength={6} editable={!disabled} />
        <Text style={ui.note}>할인 금액과 할인율 중 하나만 입력하고, 이용 조건은 아래 메모에 보관하세요.</Text>
      </>}
      <Button label={extras ? "추가 정보 접기" : "구매 가격·발행처 추가 정보"} secondary disabled={disabled} onPress={() => setExtras(!extras)} />
      {extras && <>
        <Field label="구매 가격 (원, 선택)" value={moneyInput(form, "purchasePrice")} onChangeText={(v) => amount("purchasePrice", v)} keyboardType="number-pad" maxLength={16} editable={!disabled} />
        <Field label="발행처 (선택)" value={current.issuer} onChangeText={(issuer) => onChange({ ...form, catalogue: { ...current, issuer } })} maxLength={200} editable={!disabled} />
        <Field label="구매·전달 경로 (선택)" value={current.purchaseChannel} onChangeText={(purchaseChannel) => onChange({ ...form, catalogue: { ...current, purchaseChannel } })} maxLength={200} editable={!disabled} />
      </>}
      {!!moneyError && <Text accessibilityRole="alert" style={ui.error}>{moneyError}</Text>}
      {brand && <Button label="공식 메뉴·안내 보기" secondary disabled={disabled} onPress={() => Linking.openURL(brand.source.url).catch((e) => setError(e.message))} />}
      <Text style={ui.note}>이름은 아래에서 수정할 수 있습니다. 메뉴 선택은 쿠폰의 사용 조건·바코드·만료일을 바꾸지 않습니다.</Text>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { width: "48%", flexGrow: 1, maxWidth: "100%", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, flexDirection: "row", backgroundColor: "#F8FAFC" },
  select: { padding: 12, gap: 7, flex: 1, minWidth: 0 }, star: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  brandRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
});
